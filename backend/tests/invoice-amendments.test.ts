import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../src/generated/prisma/index.js";

const db = vi.hoisted(() => ({ session: { findFirst: vi.fn() }, invoice: { findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() }, invoiceItem: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn(), delete: vi.fn() }, inventoryItem: { findFirst: vi.fn(), update: vi.fn() }, inventoryTransaction: { create: vi.fn() }, repair: { updateMany: vi.fn() }, auditLog: { create: vi.fn() }, $transaction: vi.fn() }));
vi.mock("../src/lib/prisma.js", () => ({ prisma: db }));
import { recalculateInvoice, reconcileInvoiceStock } from "../src/modules/invoices/invoice.service.js";
import { invoiceRouter } from "../src/modules/invoices/invoice.routes.js";
import { errorHandler } from "../src/middleware/error-handler.js";

const tx = db as unknown as Prisma.TransactionClient;
const businessId="11111111-1111-4111-8111-111111111111", userId="22222222-2222-4222-8222-222222222222", id="44444444-4444-4444-8444-444444444444";
const line = { quantity: 1, unitPrice: 1000, taxRate: 0, discount: 0 };
const base = { id, businessId, number: "INV-2026-000001", status: "ISSUED" as const, kraStatus: "NOT_REQUIRED", total: 1000, amountPaid: 250, invoiceLevelDiscount: 0, items: [line] };
const app=express();app.use(express.json());app.use('/invoices',invoiceRouter);app.use(errorHandler);
function token(role="BUSINESS_ADMIN") {
 db.session.findFirst.mockResolvedValue({ id, user: { id:userId,businessId,status:"ACTIVE",deletedAt:null,role:{code:role},business:{status:"ACTIVE",deletedAt:null} } });
 return jwt.sign({sid:id,role,businessId,type:"access"},process.env.JWT_SECRET!,{subject:userId,issuer:"repairtrack-api",audience:"repairtrack-clients",expiresIn:"5m"});
}
beforeEach(()=>{vi.resetAllMocks();db.$transaction.mockImplementation(async fn=>fn(tx));db.invoice.findFirst.mockResolvedValue(base);db.invoice.findUnique.mockResolvedValue(base);db.invoice.findUniqueOrThrow.mockResolvedValue(base);});

describe('issued invoice financial guardrails',()=>{
 it('rejects amendments below payments before writing revised totals',async()=>{
  await expect(recalculateInvoice(tx,id,751)).rejects.toMatchObject({code:'INVOICE_BELOW_PAYMENTS',status:409});
  expect(db.invoice.update).not.toHaveBeenCalled();
 });
 it('keeps payment records intact and derives partially-paid status after a discount',async()=>{
  await recalculateInvoice(tx,id,100);
  expect(db.invoice.update).toHaveBeenCalledWith({where:{id},data:expect.objectContaining({total:900,balance:650,status:'PARTIALLY_PAID',paymentStatus:'PARTIALLY_PAID',invoiceLevelDiscount:100})});
 });
 it('reopens a paid balance when the corrected total increases; uses exact cents',async()=>{
  db.invoice.findUnique.mockResolvedValue({...base,status:'PAID',amountPaid:200.05,items:[{...line,unitPrice:250.10}]});
  await recalculateInvoice(tx,id);
  expect(db.invoice.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({balance:50.05,status:'PARTIALLY_PAID'})}));
 });
 it('preserves draft status and allows a zero outstanding balance',async()=>{
  db.invoice.findUnique.mockResolvedValue({...base,status:'DRAFT',amountPaid:0});
  await recalculateInvoice(tx,id,1000);
  expect(db.invoice.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({total:0,status:'DRAFT'})}));
 });
});

describe('invoice amendment stock reconciliation',()=>{
 const previous = {inventoryItemId:'stock-a',quantity:new Prisma.Decimal(2),stockDeductedAt:new Date(),sourceType:null};
 it('does not deduct stock again when only price or discount changes',async()=>{
  await reconcileInvoiceStock(tx,base,userId,previous,{inventoryItemId:'stock-a',quantity:2});
  expect(db.inventoryItem.findFirst).not.toHaveBeenCalled();
 });
 it('deducts only the extra units and records an inventory movement',async()=>{
  db.inventoryItem.findFirst.mockResolvedValue({id:'stock-a',name:'Part',quantity:5});
  await reconcileInvoiceStock(tx,base,userId,previous,{inventoryItemId:'stock-a',quantity:3});
  expect(db.inventoryItem.update).toHaveBeenCalledWith({where:{id:'stock-a'},data:{quantity:4}});
  expect(db.inventoryTransaction.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({businessId,quantityDelta:-1,reference:base.number})}));
 });
 it('rejects insufficient stock and fractional inventory quantities',async()=>{
  db.inventoryItem.findFirst.mockResolvedValue({id:'stock-a',name:'Part',quantity:0});
  await expect(reconcileInvoiceStock(tx,base,userId,previous,{inventoryItemId:'stock-a',quantity:3})).rejects.toMatchObject({code:'INSUFFICIENT_STOCK'});
  await expect(reconcileInvoiceStock(tx,base,userId,previous,{inventoryItemId:'stock-a',quantity:2.5})).rejects.toMatchObject({code:'INVENTORY_QUANTITY_WHOLE_NUMBER'});
  expect(db.inventoryItem.update).not.toHaveBeenCalled();
 });
 it('returns consumed stock when an ordinary invoice line is removed',async()=>{
  db.inventoryItem.findFirst.mockResolvedValue({id:'stock-a',name:'Part',quantity:5});
  await reconcileInvoiceStock(tx,base,userId,previous,null);
  expect(db.inventoryItem.update).toHaveBeenCalledWith({where:{id:'stock-a'},data:{quantity:7}});
 });
 it('does not consume new draft lines before issue',async()=>{
  expect(await reconcileInvoiceStock(tx,{...base,status:'DRAFT'},userId,null,{inventoryItemId:'stock-a',quantity:1})).toBeNull();
  expect(db.inventoryItem.update).not.toHaveBeenCalled();
 });
 it('protects quantities belonging to repair consumption records',async()=>{
  await expect(reconcileInvoiceStock(tx,base,userId,{...previous,sourceType:'repair_part'},null)).rejects.toMatchObject({code:'REPAIR_PART_STOCK_LOCKED'});
 });
});

describe('invoice amendment API authorization and audit',()=>{
 it('requires admin authentication before looking up or changing an invoice',async()=>{
  await request(app).patch(`/invoices/${id}`).send({invoiceDiscount:10}).expect(401);
  for(const role of ['CUSTOMER','TECHNICIAN','SUPER_ADMIN']) await request(app).patch(`/invoices/${id}`).set('authorization',`Bearer ${token(role)}`).send({invoiceDiscount:10}).expect(403);
  expect(db.invoice.findFirst).not.toHaveBeenCalled();
 });
 it('requires a reason for issued invoice changes',async()=>{
  await request(app).patch(`/invoices/${id}`).set('authorization',`Bearer ${token()}`).send({invoiceDiscount:10}).expect(422);
  expect(db.invoice.update).not.toHaveBeenCalled();
 });
 it('scopes lookup to the tenant and records old/revised discount and totals',async()=>{
  await request(app).patch(`/invoices/${id}`).set('authorization',`Bearer ${token()}`).send({invoiceDiscount:100,changeReason:'Agreed customer discount'}).expect(200);
  expect(db.invoice.findFirst).toHaveBeenCalledWith({where:{id,businessId,deletedAt:null}});
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'Serializable'});
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({action:'INVOICE_EDITED',metadata:expect.objectContaining({previousTotal:'1000',reason:'Agreed customer discount'})})}));
 });
 it('rejects another tenant or deleted invoice and protected tax submissions',async()=>{
  db.invoice.findFirst.mockResolvedValue(null);
  await request(app).patch(`/invoices/${id}`).set('authorization',`Bearer ${token()}`).send({invoiceDiscount:100,changeReason:'Correction'}).expect(404);
  db.invoice.findFirst.mockResolvedValue({...base,kraStatus:'CONFIRMED'});
  await request(app).patch(`/invoices/${id}`).set('authorization',`Bearer ${token()}`).send({invoiceDiscount:100,changeReason:'Correction'}).expect(409);
  expect(db.invoice.update).not.toHaveBeenCalled();
 });
 it('does not permit posted payments or status to be overwritten in an edit',async()=>{
  await request(app).patch(`/invoices/${id}`).set('authorization',`Bearer ${token()}`).send({amountPaid:0,status:'DRAFT',changeReason:'Bad edit'}).expect(422);
  expect(db.$transaction).not.toHaveBeenCalled();
 });
});
