import { Alert, Box, Button, Card, CardContent, CircularProgress, Link, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import { api, apiMessage } from "../api/client";
import { BrandLogo } from "../components/BrandLogo";

function AuthCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <Box className="product-ui" minHeight="100dvh" display="grid" sx={{ placeItems: "center" }} p={2}><Card sx={{ width: "100%", maxWidth: 500 }}><CardContent sx={{ p: { xs: 3, sm: 5 } }}><Box mb={3}><BrandLogo className="brand-logo--auth" /></Box><Typography component="h1" variant="h4" fontWeight={750}>{title}</Typography><Typography color="text.secondary" mt={1} mb={3}>{description}</Typography>{children}</CardContent></Card></Box>;
}

interface SignupFields { businessId: string; fullName: string; email: string; phone: string; password: string }
const passwordHelp = "12–128 characters, including uppercase, lowercase, a number and a symbol.";
const passwordRules = { required: "Enter a password.", minLength: { value: 12, message: "Use at least 12 characters." }, maxLength: { value: 128, message: "Use no more than 128 characters." }, validate: (value: string) => (/[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value)) || "Include uppercase, lowercase, a number and a symbol." };
export function SignupPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupFields>();
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const submit = handleSubmit(async (values) => { setError(""); try { await api.post("/auth/signup", values); setMessage("Your account was created. Check your email for the verification link."); } catch (reason) { setError(apiMessage(reason)); } });
  return <AuthCard title="Create your customer account" description="Use the business ID shown on your repair intake receipt.">
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}{message ? <Alert severity="success">{message}</Alert> : <Stack component="form" noValidate onSubmit={(event) => void submit(event)} spacing={2.5}>
      <TextField label="Repair business ID" {...register("businessId", { required: "Business ID is required." })} error={Boolean(errors.businessId)} helperText={errors.businessId?.message ?? "Ask your repair shop if you do not have this ID."} />
      <TextField label="Full name" autoComplete="name" {...register("fullName", { required: "Enter your name.", validate: (value) => value.trim().length >= 2 || "Use at least 2 characters.", maxLength: { value: 120, message: "Use no more than 120 characters." } })} error={Boolean(errors.fullName)} helperText={errors.fullName?.message} />
      <TextField label="Email" type="email" autoComplete="email" {...register("email", { required: "Enter your email address.", pattern: { value: /^\S+@\S+\.\S+$/, message: "Enter a valid email address." }, maxLength: { value: 254, message: "Use no more than 254 characters." } })} error={Boolean(errors.email)} helperText={errors.email?.message} />
      <TextField label="Phone" type="tel" autoComplete="tel" {...register("phone", { required: "Enter your phone number.", validate: (value) => (value.trim().length >= 7 && value.trim().length <= 30) || "Use 7–30 characters, including the country code." })} error={Boolean(errors.phone)} helperText={errors.phone?.message} />
      <TextField label="Password" type="password" autoComplete="new-password" {...register("password", passwordRules)} error={Boolean(errors.password)} helperText={errors.password?.message ?? passwordHelp} />
      <Button variant="contained" type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating account…" : "Create account"}</Button>
    </Stack>}<Typography mt={3} textAlign="center"><Link component={RouterLink} to="/login">Back to sign in</Link></Typography>
  </AuthCard>;
}

export function ForgotPasswordPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ email: string }>(); const [message, setMessage] = useState("");
  const submit = handleSubmit(async (values) => { await api.post("/auth/forgot-password", values).catch(() => undefined); setMessage("For your privacy, we cannot confirm whether an account exists or whether email delivery succeeded. If reset instructions arrive, use the latest link. Otherwise retry later or contact your service provider."); });
  return <AuthCard title="Reset your password" description="Request a short-lived reset link for your verified email address.">{message && <Alert severity="info" sx={{ mb: 2 }}>{message}</Alert>}<Stack component="form" noValidate onSubmit={(event) => void submit(event)} spacing={2.5}><TextField label="Email address" type="email" autoComplete="email" {...register("email", { required: "Enter your email address.", pattern: { value: /^\S+@\S+\.\S+$/, message: "Enter a valid email address." } })} error={Boolean(errors.email)} helperText={errors.email?.message} /><Button variant="contained" type="submit" disabled={isSubmitting}>{isSubmitting ? "Requesting…" : "Send reset link"}</Button></Stack><Typography mt={3} textAlign="center"><Link component={RouterLink} to="/login">Back to sign in</Link></Typography></AuthCard>;
}

export function ResetPasswordPage() {
  const [params] = useSearchParams(); const navigate = useNavigate(); const [error, setError] = useState(""); const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<{ password: string }>();
  const submit = handleSubmit(async ({ password }) => { try { await api.post("/auth/reset-password", { token: params.get("token"), password }); void navigate("/login", { replace: true }); } catch (reason) { setError(apiMessage(reason)); } });
  return <AuthCard title="Choose a new password" description="This signs the account out on every device.">{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}{!params.get("token") && <Alert severity="warning" sx={{ mb: 2 }}>Open the complete reset link from your email, or request a new one.</Alert>}<Stack component="form" noValidate onSubmit={(event) => void submit(event)} spacing={2.5}><TextField label="New password" type="password" autoComplete="new-password" {...register("password", passwordRules)} error={Boolean(errors.password)} helperText={errors.password?.message ?? passwordHelp} /><Button variant="contained" type="submit" disabled={isSubmitting || !params.get("token")}>{isSubmitting ? "Saving…" : "Save new password"}</Button><Button component={RouterLink} to="/forgot-password">Request a new reset link</Button></Stack></AuthCard>;
}

export function VerifyEmailPage() {
  const [params] = useSearchParams(); const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const verify = async () => { setState("loading"); try { await api.post("/auth/verify-email", { token: params.get("token") }); setState("done"); } catch { setState("error"); } };
  return <AuthCard title="Verify your email" description="Confirm the address before signing in."><Stack spacing={2}>{state === "done" && <Alert severity="success">Email verified. You can now sign in.</Alert>}{(state === "error" || !params.get("token")) && <Alert severity="error">This link is invalid or expired. Use the complete verification link from your email.</Alert>}<Button variant="contained" onClick={() => void verify()} disabled={state === "loading" || state === "done" || !params.get("token")}>{state === "loading" ? <CircularProgress size={22} /> : state === "done" ? "Verified" : "Verify email"}</Button><Button component={RouterLink} to="/login">Go to sign in</Button></Stack></AuthCard>;
}
