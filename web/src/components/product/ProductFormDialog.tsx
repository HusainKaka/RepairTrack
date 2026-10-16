import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, Typography, useMediaQuery } from "@mui/material";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

function formSnapshot(form: HTMLFormElement | null): string {
  return JSON.stringify(Array.from(form?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select") ?? []).map((field) => ({ value: field.value, checked: field instanceof HTMLInputElement && ["checkbox", "radio"].includes(field.type) ? field.checked : undefined })));
}

export interface ProductFormDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  busy?: boolean;
  error?: string;
  description?: string;
  dirty?: boolean;
  maxWidth?: "sm" | "md" | "lg";
  submitLabel?: string;
  submitDisabled?: boolean;
  onClose(): void;
  onSubmit(): void;
}

export function ProductFormDialog(props: ProductFormDialogProps) {
  return props.open ? <OpenFormDialog {...props} /> : null;
}

function OpenFormDialog({ title, children, busy = false, error, description, dirty, maxWidth = "sm", submitLabel = "Save", submitDisabled = false, onClose, onSubmit }: ProductFormDialogProps) {
  const titleId = useId();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const descriptionId = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const submitted = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const initialSnapshot = useRef<string | null>(null);
  const attachForm = useCallback((element: HTMLFormElement | null) => { formRef.current = element; if (element && initialSnapshot.current === null) initialSnapshot.current = formSnapshot(element); }, []);
  const [edited, setEdited] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [validation, setValidation] = useState<{ message: string; field: HTMLElement }[]>([]);
  useEffect(() => { if (!busy) submitted.current = false; }, [busy, error]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (!(dirty ?? (edited || formSnapshot(formRef.current) !== initialSnapshot.current))) return; event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, edited]);
  const close = () => { if (busy) return; if (dirty ?? (edited || formSnapshot(formRef.current) !== initialSnapshot.current)) setConfirmClose(true); else onClose(); };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || submitDisabled || submitted.current) return;
    const issues: { message: string; field: HTMLElement }[] = [];
    for (const field of event.currentTarget.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")) {
      if (field.disabled || field.type === "hidden") continue;
      const control = field.getAttribute("aria-hidden") === "true" ? field.parentElement?.querySelector<HTMLElement>("[role=combobox]") ?? field : field;
      const labelId = control.getAttribute("aria-labelledby")?.split(" ")[0];
      const label = (field.labels?.[0]?.textContent ?? (labelId ? document.getElementById(labelId)?.textContent : null) ?? field.getAttribute("aria-label") ?? "This field").replace(/\s*\*$/, "").trim();
      let message = "";
      if (field.required && !field.value.trim()) message = `${label} is required.`;
      else if (field.validity.badInput) message = `Enter a valid ${label.toLowerCase()}.`;
      else if (field.value && field.validity.typeMismatch) message = `Enter a valid ${label.toLowerCase()}.`;
      else if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && field.value && field.minLength > 0 && field.value.length < field.minLength) message = `${label} needs at least ${field.minLength} characters.`;
      else if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && field.maxLength >= 0 && field.value.length > field.maxLength) message = `${label} must be no more than ${field.maxLength} characters.`;
      else if (field.validity.rangeUnderflow) message = `${label} must be at least ${field.getAttribute("min")}.`;
      else if (field.validity.rangeOverflow) message = `${label} must be no more than ${field.getAttribute("max")}.`;
      else if (field.validity.patternMismatch) message = `Check the format of ${label.toLowerCase()}.`;
      // Legacy number fields allowed decimal money via click submission. Do not
      // introduce the browser's implicit step=1 as a new business restriction.
      else if (field.hasAttribute("step") && field.validity.stepMismatch) message = `Check the increments for ${label.toLowerCase()}.`;
      if (message) issues.push({ message, field: control });
    }
    setValidation(issues);
    if (issues.length) { queueMicrotask(() => errorRef.current?.focus()); return; }
    submitted.current = true;
    onSubmit();
    // A synchronous acknowledgement (for example Done) need not set busy.
    queueMicrotask(() => { submitted.current = false; });
  };
  return <>
    <Dialog open onClose={close} transitionDuration={reducedMotion ? 0 : 150} fullWidth maxWidth={maxWidth} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className="product-ui product-dialog">
      <Box component="form" ref={attachForm} noValidate onSubmit={submit} onChangeCapture={() => { setEdited(true); setValidation([]); }} sx={{ display: "flex", flexDirection: "column", minHeight: 0, maxHeight: "inherit" }} aria-busy={busy}>
        <DialogTitle id={titleId} sx={{ pb: description ? 1 : 2 }}>{title}</DialogTitle>
        {description && <Typography id={descriptionId} variant="body2" color="text.secondary" px={3} pb={2}>{description}</Typography>}
        <DialogContent dividers><Stack spacing={2.5} py={1}>{(error || validation.length > 0) && <Alert severity="error" tabIndex={-1} ref={errorRef}>{error}{validation.length > 0 && <Box component="ul" sx={{ my: 0, pl: 2 }}>{validation.map((issue, index) => <li key={index}><Button type="button" color="inherit" onClick={() => issue.field.focus()} sx={{ textAlign: "left", justifyContent: "flex-start", fontWeight: 500 }}>{issue.message}</Button></li>)}</Box>}</Alert>}{children}</Stack></DialogContent>
        <DialogActions sx={{ p: { xs: 2, sm: 3 }, gap: 1 }}><Button type="button" onClick={close} disabled={busy}>Cancel</Button><Button type="submit" variant="contained" disabled={busy || submitDisabled}>{busy ? "Saving…" : submitLabel}</Button></DialogActions>
        {busy && <LinearProgress aria-label="Saving changes" />}
      </Box>
    </Dialog>
    <Dialog open={confirmClose} transitionDuration={reducedMotion ? 0 : 150} onClose={() => setConfirmClose(false)} aria-labelledby={`${titleId}-close`} maxWidth="xs" fullWidth className="product-ui product-dialog">
      <DialogTitle id={`${titleId}-close`}>Leave this form?</DialogTitle><DialogContent><Typography color="text.secondary">Your changes have not been saved. Keep editing to finish, or close without saving.</Typography></DialogContent><DialogActions sx={{ p: 2, gap: 1 }}><Button onClick={() => setConfirmClose(false)} autoFocus variant="outlined">Keep editing</Button><Button onClick={() => { setConfirmClose(false); onClose(); }}>Close without saving</Button></DialogActions>
    </Dialog>
  </>;
}
