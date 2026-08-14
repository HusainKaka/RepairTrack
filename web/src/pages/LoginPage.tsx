import LockOutlined from "@mui/icons-material/LockOutlined";
import MailOutline from "@mui/icons-material/MailOutline";
import { Alert, Box, Button, Checkbox, CircularProgress, Divider, FormControlLabel, InputAdornment, Link, Stack, TextField, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link as RouterLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { apiMessage } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { BrandLogo } from "../components/BrandLogo";

interface LoginFields { email: string; password: string }

declare global { interface Window { google?: { accounts: { id: { initialize(options: { client_id: string; callback(response: { credential: string }): void }): void; renderButton(element: HTMLElement, options: Record<string, unknown>): void } } } } }

export function LoginPage() {
  const { user, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const googleButton = useRef<HTMLDivElement>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginFields>({ defaultValues: { email: "", password: "" } });
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    let cancelled = false; let attempts = 0;
    const render = () => {
      if (cancelled || !clientId || !googleButton.current) return;
      if (!window.google) { if (attempts++ < 30) window.setTimeout(render, 200); return; }
      window.google.accounts.id.initialize({ client_id: clientId, callback: ({ credential }) => { void loginWithGoogle(credential).then(() => { void navigate("/", { replace: true }); }).catch((reason: unknown) => setError(apiMessage(reason))); } });
      googleButton.current.replaceChildren();
      window.google.accounts.id.renderButton(googleButton.current, { theme: "outline", size: "large", width: googleButton.current.clientWidth, text: "continue_with" });
    };
    render(); return () => { cancelled = true; };
  }, [loginWithGoogle, navigate]);
  if (user) return <Navigate to="/" replace />;
  const submit = handleSubmit(async (values) => {
    setError("");
    try { await login(values.email, values.password); void navigate((location.state as { from?: string } | null)?.from ?? "/", { replace: true }); }
    catch (reason) { setError(apiMessage(reason)); }
  });
  return <Box className="login-shell">
    <Box className="login-panel"><Box width="100%" maxWidth={430}>
      <Box mb={4}><BrandLogo className="brand-logo--login" /></Box>
      <Typography variant="h3" fontWeight={800} letterSpacing="-.055em" mb={1}>Welcome back</Typography>
      <Typography color="text.secondary" mb={4}>Sign in to manage repairs, or check the status of your own device.</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack component="form" onSubmit={(event) => void submit(event)} spacing={2.2} noValidate>
        <TextField label="Email address" type="email" autoComplete="email" error={Boolean(errors.email)} helperText={errors.email?.message} {...register("email", { required: "Enter your email address.", pattern: { value: /^\S+@\S+\.\S+$/, message: "Enter a valid email address." } })} slotProps={{ input: { startAdornment: <InputAdornment position="start"><MailOutline fontSize="small" /></InputAdornment> } }} />
        <TextField label="Password" type="password" autoComplete="current-password" error={Boolean(errors.password)} helperText={errors.password?.message} {...register("password", { required: "Enter your password." })} slotProps={{ input: { startAdornment: <InputAdornment position="start"><LockOutlined fontSize="small" /></InputAdornment> } }} />
        <Stack direction="row" alignItems="center" justifyContent="space-between"><FormControlLabel control={<Checkbox defaultChecked />} label={<Typography variant="body2">Keep me signed in</Typography>} /><Link component={RouterLink} to="/forgot-password" fontWeight={700} variant="body2">Forgot password?</Link></Stack>
        <Button type="submit" size="large" variant="contained" disabled={isSubmitting}>{isSubmitting ? <CircularProgress size={22} color="inherit" /> : "Sign in securely"}</Button>
      </Stack>
      <Divider sx={{ my: 3 }}>or</Divider>
      {import.meta.env.VITE_GOOGLE_CLIENT_ID ? <Box ref={googleButton} minHeight={44} /> : <Alert severity="info">Google sign-in becomes available after VITE_GOOGLE_CLIENT_ID is configured.</Alert>}
      <Typography textAlign="center" color="text.secondary" mt={3}>New customer? <Link component={RouterLink} to="/signup" fontWeight={750}>Create an account</Link></Typography>
      <Typography textAlign="center" mt={1}><Link component={RouterLink} to="/track" variant="body2">Track a repair without signing in</Link></Typography>
    </Box></Box>
    <Box className="login-story"><Stack direction="row" alignItems="center" gap={1}><Box width={9} height={9} bgcolor="#34D399" borderRadius="50%" /><Typography variant="body2" fontWeight={700}>Secure repair operations, one clear timeline</Typography></Stack><Box position="relative" zIndex={1} maxWidth={650}><Typography variant="h2" fontWeight={800} lineHeight={1.05} mb={3}>Every device.<br />Every update.<br />Accounted for.</Typography><Typography fontSize={19} color="rgba(255,255,255,.72)" maxWidth={560}>RepairTrack connects your front desk, technicians, inventory, payments, and customers without exposing private workshop notes.</Typography><Stack direction="row" gap={4} mt={6}><Box><Typography variant="h4" fontWeight={800}>10</Typography><Typography color="rgba(255,255,255,.6)">repair stages</Typography></Box><Box><Typography variant="h4" fontWeight={800}>24/7</Typography><Typography color="rgba(255,255,255,.6)">customer tracking</Typography></Box><Box><Typography variant="h4" fontWeight={800}>1</Typography><Typography color="rgba(255,255,255,.6)">shared record</Typography></Box></Stack></Box><Typography variant="caption" color="rgba(255,255,255,.5)">Designed for independent ICT and electronics repair teams.</Typography></Box>
  </Box>;
}
