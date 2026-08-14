import { Alert, Box, Button, Card, CardContent, CircularProgress, Link, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import { api, apiMessage } from "../api/client";
import { BrandLogo } from "../components/BrandLogo";

function AuthCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <Box minHeight="100vh" display="grid" bgcolor="background.default" sx={{ placeItems: "center" }} p={2}><Card sx={{ width: "100%", maxWidth: 500 }}><CardContent sx={{ p: { xs: 3, sm: 5 } }}><Box mb={3}><BrandLogo className="brand-logo--auth" /></Box><Typography variant="h4" fontWeight={800}>{title}</Typography><Typography color="text.secondary" mt={1} mb={3}>{description}</Typography>{children}</CardContent></Card></Box>;
}

interface SignupFields { businessId: string; fullName: string; email: string; phone: string; password: string }
export function SignupPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupFields>();
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const submit = handleSubmit(async (values) => { setError(""); try { await api.post("/auth/signup", values); setMessage("Your account was created. Check your email for the verification link."); } catch (reason) { setError(apiMessage(reason)); } });
  return <AuthCard title="Create your customer account" description="Use the business ID shown on your repair intake receipt.">{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}{message ? <Alert severity="success">{message}</Alert> : <Stack component="form" onSubmit={(event) => void submit(event)} spacing={2}><TextField label="Repair business ID" {...register("businessId", { required: "Business ID is required." })} error={Boolean(errors.businessId)} helperText={errors.businessId?.message} /><TextField label="Full name" {...register("fullName", { required: "Name is required." })} /><TextField label="Email" type="email" {...register("email", { required: "Email is required." })} /><TextField label="Phone" {...register("phone", { required: "Phone is required." })} /><TextField label="Password" type="password" helperText="At least 12 characters with uppercase, lowercase, number, and symbol." {...register("password", { required: "Password is required.", minLength: 12 })} /><Button variant="contained" type="submit" disabled={isSubmitting}>{isSubmitting ? <CircularProgress size={22} /> : "Create account"}</Button></Stack>}<Typography mt={3} textAlign="center"><Link component={RouterLink} to="/login">Back to sign in</Link></Typography></AuthCard>;
}

export function ForgotPasswordPage() {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ email: string }>(); const [message, setMessage] = useState("");
  const submit = handleSubmit(async (values) => { await api.post("/auth/forgot-password", values).catch(() => undefined); setMessage("If that account exists, a reset link has been sent."); });
  return <AuthCard title="Reset your password" description="We will send a short-lived reset link to the verified email address.">{message ? <Alert severity="success">{message}</Alert> : <Stack component="form" onSubmit={(event) => void submit(event)} spacing={2}><TextField label="Email address" type="email" {...register("email", { required: true })} /><Button variant="contained" type="submit" disabled={isSubmitting}>Send reset link</Button></Stack>}<Typography mt={3} textAlign="center"><Link component={RouterLink} to="/login">Back to sign in</Link></Typography></AuthCard>;
}

export function ResetPasswordPage() {
  const [params] = useSearchParams(); const navigate = useNavigate(); const [error, setError] = useState(""); const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ password: string }>();
  const submit = handleSubmit(async ({ password }) => { try { await api.post("/auth/reset-password", { token: params.get("token"), password }); void navigate("/login", { replace: true }); } catch (reason) { setError(apiMessage(reason)); } });
  return <AuthCard title="Choose a new password" description="This signs the account out on every device.">{error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}<Stack component="form" onSubmit={(event) => void submit(event)} spacing={2}><TextField label="New password" type="password" {...register("password", { required: true, minLength: 12 })} /><Button variant="contained" type="submit" disabled={isSubmitting}>Save new password</Button></Stack></AuthCard>;
}

export function VerifyEmailPage() {
  const [params] = useSearchParams(); const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const verify = async () => { setState("loading"); try { await api.post("/auth/verify-email", { token: params.get("token") }); setState("done"); } catch { setState("error"); } };
  return <AuthCard title="Verify your email" description="Confirm the address before signing in."><Stack spacing={2}>{state === "done" && <Alert severity="success">Email verified. You can now sign in.</Alert>}{state === "error" && <Alert severity="error">This link is invalid or expired.</Alert>}<Button variant="contained" onClick={() => void verify()} disabled={state === "loading"}>{state === "loading" ? <CircularProgress size={22} /> : "Verify email"}</Button><Button component={RouterLink} to="/login">Go to sign in</Button></Stack></AuthCard>;
}
