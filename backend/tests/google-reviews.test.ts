import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ setting:{findUnique:vi.fn(),upsert:vi.fn()},session:{findFirst:vi.fn()},auditLog:{create:vi.fn()},$transaction:vi.fn() }));
vi.mock('../src/lib/prisma.js',()=>({prisma:db}));
import { getGoogleReviewUrl, googleReviewUrl } from '../src/lib/google-review.js';
import { settingRouter } from '../src/modules/settings/setting.routes.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { renderRepairEmail } from '../src/modules/notifications/email-templates.js';
const url='https://g.page/r/Cbadgp9VKwYjEBI/review';
const businessId='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222';
const app=express();app.use(express.json());app.use('/settings',settingRouter);app.use(errorHandler);
function token(role='BUSINESS_ADMIN') {
 db.session.findFirst.mockResolvedValue({id:userId,user:{id:userId,businessId,status:'ACTIVE',deletedAt:null,role:{code:role},business:{status:'ACTIVE',deletedAt:null}}});
 return jwt.sign({sid:userId,role,businessId,type:'access'},process.env.JWT_SECRET!,{subject:userId,issuer:'repairtrack-api',audience:'repairtrack-clients',expiresIn:'5m'});
}
beforeEach(()=>{vi.resetAllMocks();db.$transaction.mockImplementation(async fn=>fn(db));});
describe('Google review destination boundary',()=>{
 it.each([url,'https://search.google.com/local/writereview?placeid=ChIJExamplePlace','https://maps.app.goo.gl/AbCdEf123'])('accepts an explicit public Google link: %s',value=>expect(googleReviewUrl(value)).toBe(value));
 it.each(['javascript:alert(1)','http://g.page/r/a/review','https://g.page.evil.test/r/a/review','https://g.page@evil.test/r/a/review','https://evil.test','https://www.google.com/url?url=https://evil.test','https://g.page/r/a/review#evil','https://g.page\\@evil.test/r/a/review','data:text/html,test'])('rejects unsafe or unrelated URLs: %s',value=>expect(googleReviewUrl(value)).toBeNull());
 it('checks business scope before using a saved URL',async()=>{
  db.setting.findUnique.mockResolvedValue({businessId:'other-business',value:{googleReviewUrl:url}});
  expect(await getGoogleReviewUrl(businessId)).toBeNull();
  expect(db.setting.findUnique).toHaveBeenCalledWith({where:{scope_key:{scope:`business:${businessId}`,key:'reviews.google'}}});
 });
 it('requires admin permission and rejects invalid links without writing',async()=>{
  await request(app).put('/settings/reviews').send({googleReviewUrl:url}).expect(401);
  await request(app).put('/settings/reviews').set('authorization',`Bearer ${token('TECHNICIAN')}`).send({googleReviewUrl:url}).expect(403);
  await request(app).put('/settings/reviews').set('authorization',`Bearer ${token()}`).send({googleReviewUrl:'https://evil.test'}).expect(422);
  expect(db.setting.upsert).not.toHaveBeenCalled();
 });
 it('saves and can disable only the current business setting with an audit record',async()=>{
  await request(app).put('/settings/reviews').set('authorization',`Bearer ${token()}`).send({googleReviewUrl:url}).expect(200);
  expect(db.setting.upsert).toHaveBeenCalledWith(expect.objectContaining({where:{scope_key:{scope:`business:${businessId}`,key:'reviews.google'}},create:expect.objectContaining({businessId,value:{googleReviewUrl:url}})}));
  await request(app).put('/settings/reviews').set('authorization',`Bearer ${token()}`).send({googleReviewUrl:null}).expect(200);
  expect(db.auditLog.create).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({action:'GOOGLE_REVIEW_SETTINGS_UPDATED',metadata:{enabled:false}})}));
 });
 it('prevents the generic setting registry bypassing validation',async()=>{
  await request(app).put('/settings/reviews.google').set('authorization',`Bearer ${token()}`).send({value:{googleReviewUrl:'javascript:alert(1)'}}).expect(403);
 });
 it('includes a neutral review invitation in HTML and plain text, while retaining tracking',()=>{
  const input={business:{name:'Workshop',email:'office@example.test',phone:'+254700000000',address:'Address',city:'City'},customerName:'Customer <img src=x>',reference:'RT-2026-1',device:'Laptop',dateReceived:new Date(),trackingUrl:'https://repair.example/track/private',statusLabel:'COMPLETED',message:'Your repair is complete.',currency:'KES',reviewUrl:url};
  const result=renderRepairEmail(input);
  expect(result.html).toContain(`href="${url}"`);expect(result.text).toContain(url);expect(result.html).toContain(input.trackingUrl);expect(result.html).not.toContain('<img src=x>');
  expect(renderRepairEmail({...input,reviewUrl:'javascript:alert(1)'}).html).not.toContain('Leave a Google review');
 });
});
