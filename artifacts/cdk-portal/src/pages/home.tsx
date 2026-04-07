import { useState } from "react";
import {
  useGetBalance,
  useActivateKey,
  useGetOrders,
  useValidateKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Zap,
  ExternalLink,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  XCircle,
  Mail,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

function StepCircle({
  step,
  currentStep,
  completed,
}: {
  step: number;
  currentStep: number;
  completed: boolean;
}) {
  if (completed) {
    return (
      <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground z-10 shrink-0 shadow-sm shadow-primary/30">
        <Check className="w-4 h-4 stroke-[2.5]" />
      </div>
    );
  }
  if (step === currentStep) {
    return (
      <div className="w-9 h-9 rounded-full bg-background flex items-center justify-center text-foreground border-2 border-foreground font-semibold z-10 shrink-0 text-sm">
        {step}
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground border-2 border-muted/70 font-semibold z-10 shrink-0 text-sm">
      {step}
    </div>
  );
}

export default function Home() {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [cdkKey, setCdkKey] = useState<string>("");
  const [jsonText, setJsonText] = useState<string>("");
  const [userToken, setUserToken] = useState<string>("");
  const [jsonError, setJsonError] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [ordersOpen, setOrdersOpen] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);

  const { data: balanceData } = useGetBalance();
  const { data: ordersData } = useGetOrders({ per_page: 5 });
  const validateMutation = useValidateKey();
  const activateMutation = useActivateKey();

  const validationResult = validateMutation.data as unknown as {
    success: boolean;
    data?: {
      status: "valid" | "already_used" | "invalid";
      product?: string;
      subscription?: string;
      email?: string;
      activated_at?: string;
      message?: string;
    };
  } | undefined;

  const keyStatus = validationResult?.data?.status;
  const isKeyValid = keyStatus === "valid";

  const handleCopyKey = () => {
    navigator.clipboard.writeText(cdkKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleValidateKey = () => {
    if (!cdkKey.trim()) return;
    validateMutation.reset();
    activateMutation.reset();
    setCurrentStep(1);
    validateMutation.mutate(
      { data: { key: cdkKey.trim() } },
      {
        onSuccess: (res: unknown) => {
          const r = res as { success: boolean; data?: { status: string } };
          if (r?.data?.status === "valid") {
            setCurrentStep(2);
          }
        },
      }
    );
  };

  const handleValidateJson = () => {
    setJsonError("");

    function isValidJwt(str: string): boolean {
      const parts = str.split(".");
      if (parts.length !== 3) return false;
      const b64url = /^[A-Za-z0-9_-]+$/;
      return parts.every((p) => b64url.test(p) && p.length > 10);
    }

    // Extract the longest JWT starting with eyJ from any text blob.
    // ChatGPT accessTokens are RS256 JWTs (very long, typically 1500+ chars).
    // Tracking/analytics JWTs are much shorter, so longest wins.
    function extractLongestChatGptJwt(text: string): string | null {
      const regex = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
      const matches = text.match(regex) ?? [];
      if (!matches.length) return null;
      // Sort by length descending — ChatGPT token will be the longest
      const sorted = [...matches].sort((a, b) => b.length - a.length);
      const best = sorted[0];
      // Require a minimum payload length to exclude short tracking tokens
      return best && best.length > 200 ? best : null;
    }

    const trimmed = jsonText.trim();

    // 1. User pasted a raw JWT directly
    if (isValidJwt(trimmed)) {
      console.log("[CDK] Method: raw JWT, length:", trimmed.length, "prefix:", trimmed.slice(0, 15));
      setUserToken(trimmed);
      setCurrentStep(3);
      return;
    }

    // 2. Try to parse as JSON and look for accessToken at root
    let parsedToken: string | undefined;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      parsedToken =
        (parsed.accessToken as string | undefined) ||
        (parsed.access_token as string | undefined);
    } catch {
      // Not JSON — fall through to full-text scan
    }

    if (parsedToken && isValidJwt(parsedToken)) {
      console.log("[CDK] Method: JSON root accessToken, length:", parsedToken.length, "prefix:", parsedToken.slice(0, 15));
      setUserToken(parsedToken);
      setCurrentStep(3);
      return;
    }

    // 3. Fallback: scan the entire pasted text for the longest JWT.
    //    This handles cases where the user copied a page that embeds the token.
    const scanned = extractLongestChatGptJwt(trimmed);
    if (scanned) {
      console.log("[CDK] Method: longest JWT scan, length:", scanned.length, "prefix:", scanned.slice(0, 15));
      setUserToken(scanned);
      setCurrentStep(3);
      return;
    }

    console.log("[CDK] No JWT found in pasted content, length:", trimmed.length);

    setJsonError(
      'Could not find a valid session token in the pasted content. Open the AuthSession Page link above — it opens chatgpt.com/api/auth/session showing raw JSON. Press Ctrl+A then Ctrl+C and paste the full page here.'
    );
  };

  const handleActivate = () => {
    activateMutation.mutate(
      {
        data: {
          key: cdkKey.trim(),
          user_token: userToken,
          async: false,
        },
      },
      {
        onSuccess: (res: unknown) => {
          const r = res as { success?: boolean };
          if (r?.success) {
            setShowSuccessModal(true);
          }
        },
      }
    );
  };

  const handleReset = () => {
    setCdkKey("");
    setJsonText("");
    setUserToken("");
    setJsonError("");
    setCurrentStep(1);
    validateMutation.reset();
    activateMutation.reset();
    setShowSuccessModal(false);
  };

  const activationResult = activateMutation.data as unknown as {
    success: boolean;
    data?: {
      email?: string;
      product?: string;
      subscription?: string;
      activated_at?: string;
      status?: string;
      message?: string;
    };
    message?: string;
    warning?: string;
  } | undefined;

  const isPending = activateMutation.isPending;
  // Only show inline result card for failures; successes are handled by the modal
  const showActivationResult = !!activationResult && !activationResult?.success;

  const progressPct =
    currentStep === 1 ? 0 : currentStep === 2 ? 50 : 100;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-20">
      <header className="border-b border-border/40 bg-card/60 backdrop-blur sticky top-0 z-50">
        <div className="container max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <span className="font-semibold text-base tracking-tight">CDK Portal</span>
          </div>
          {balanceData?.data && (
            <div
              className="flex items-center gap-2 text-sm bg-secondary px-3 py-1.5 rounded-full border border-border/40"
              data-testid="balance-display"
            >
              <span className="text-muted-foreground text-xs">Balance</span>
              <span
                className="font-mono font-semibold text-foreground"
                data-testid="text-balance"
              >
                {balanceData.data.balance.toFixed(2)}
              </span>
              <span className="text-muted-foreground text-xs">
                {balanceData.data.currency}
              </span>
            </div>
          )}
        </div>
      </header>

      <main className="container max-w-3xl mx-auto px-4 pt-10 flex flex-col gap-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Redeem CDK</h1>
          <p className="text-muted-foreground text-base">
            Safe and fast subscription activation service
          </p>
        </div>

        <div className="relative flex justify-between max-w-xl mx-auto w-full px-4">
          <div className="absolute top-[18px] left-12 right-12 h-0.5 bg-muted z-0">
            <div
              className="absolute top-0 left-0 h-full bg-primary transition-all duration-500 ease-in-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {[
            { step: 1, label: "Enter Key" },
            { step: 2, label: "AuthSession" },
            { step: 3, label: "Activate" },
          ].map(({ step, label }) => (
            <div key={step} className="flex flex-col items-center gap-2 z-10">
              <StepCircle
                step={step}
                currentStep={currentStep}
                completed={currentStep > step}
              />
              <span
                className={`text-xs font-medium ${
                  currentStep >= step
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {!showActivationResult && (
          <Card className="max-w-2xl mx-auto w-full border-border/40 bg-card/70 overflow-hidden">
            <CardContent className="p-0">
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold">
                    Enter and verify your CDK
                  </h2>
                </div>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Input
                      placeholder="Enter your CDK key"
                      value={cdkKey}
                      onChange={(e) => {
                        setCdkKey(e.target.value);
                        if (validateMutation.isSuccess || validateMutation.isError) {
                          validateMutation.reset();
                          setCurrentStep(1);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleValidateKey();
                      }}
                      className="font-mono pr-10 bg-input/40 border-border/50 h-11"
                      data-testid="input-cdk-key"
                    />
                    {cdkKey && (
                      <button
                        onClick={handleCopyKey}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy key"
                        data-testid="button-copy-key"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-primary" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                  <Button
                    onClick={handleValidateKey}
                    disabled={!cdkKey.trim() || validateMutation.isPending}
                    className="h-11 px-6 font-semibold shrink-0"
                    data-testid="button-validate-key"
                  >
                    {validateMutation.isPending ? "Checking..." : "Validate"}
                  </Button>
                </div>

                {validateMutation.isSuccess && validationResult?.data && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    {keyStatus === "valid" && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          className="bg-primary/20 text-primary border-primary/30 gap-1.5 px-3 py-1 text-sm"
                          data-testid="badge-key-valid"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Valid
                        </Badge>
                        {validationResult.data.subscription && (
                          <Badge
                            variant="outline"
                            className="border-primary/30 text-primary/80 px-3 py-1 text-sm"
                            data-testid="badge-subscription"
                          >
                            {validationResult.data.subscription}
                          </Badge>
                        )}
                      </div>
                    )}
                    {keyStatus === "already_used" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            className="bg-destructive/20 text-destructive border-destructive/30 gap-1.5 px-3 py-1 text-sm"
                            data-testid="badge-key-used"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Key Already Used
                          </Badge>
                          {validationResult.data.subscription && (
                            <Badge
                              variant="outline"
                              className="border-border/50 text-muted-foreground px-3 py-1 text-sm"
                              data-testid="badge-used-subscription"
                            >
                              {validationResult.data.subscription}
                            </Badge>
                          )}
                        </div>
                        {validationResult.data.email && (
                          <p className="text-sm text-muted-foreground" data-testid="text-used-email">
                            Activated for:{" "}
                            <span className="text-foreground font-medium">
                              {validationResult.data.email}
                            </span>
                          </p>
                        )}
                        {validationResult.data.activated_at && (
                          <p className="text-sm text-muted-foreground" data-testid="text-used-date">
                            Activated at:{" "}
                            <span className="text-foreground font-medium">
                              {validationResult.data.activated_at}
                            </span>
                          </p>
                        )}
                        {!validationResult.data.email && !validationResult.data.activated_at && (
                          <p className="text-sm text-muted-foreground">
                            This key has already been redeemed.
                          </p>
                        )}
                      </div>
                    )}
                    {keyStatus === "invalid" && (
                      <div className="flex items-center gap-1.5 text-destructive text-sm">
                        <AlertCircle className="w-4 h-4" />
                        <span data-testid="text-key-invalid">
                          {validationResult.data.message || "Invalid key. Please check and try again."}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {validateMutation.isError && (
                  <div className="flex items-center gap-1.5 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>Failed to validate key. Please try again.</span>
                  </div>
                )}
              </div>

              <Separator className="bg-border/30" />

              <div
                className={`p-6 space-y-4 transition-opacity duration-300 ${
                  isKeyValid && currentStep >= 2
                    ? "opacity-100"
                    : "opacity-40 pointer-events-none select-none"
                }`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h2 className="text-base font-semibold">Get AuthSession data</h2>
                  <div className="flex items-center gap-3 text-sm">
                    <a
                      href="https://chatgpt.com"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
                      data-testid="link-open-chatgpt"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open ChatGPT
                    </a>
                    <span className="text-border">|</span>
                    <a
                      href="https://chatgpt.com/api/auth/session"
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
                      data-testid="link-open-authsession"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open AuthSession Page
                    </a>
                  </div>
                </div>
                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Click <span className="text-foreground font-medium">Open AuthSession Page</span> — it opens <span className="font-mono text-xs">chatgpt.com/api/auth/session</span></li>
                  <li>You will see raw JSON (not the ChatGPT chat page) starting with <span className="font-mono text-xs text-primary">&#123;"user":&#123;...</span></li>
                  <li>Press <span className="text-foreground font-medium">Ctrl+A</span> then <span className="text-foreground font-medium">Ctrl+C</span> to copy the entire page</li>
                  <li>Paste it below and click <span className="text-foreground font-medium">Validate</span>, then activate <span className="text-yellow-500 font-medium">immediately</span></li>
                </ol>
                <p className="text-xs text-yellow-600 font-medium">⚠ Tokens expire within minutes — copy and activate without delay.</p>
                <p className="text-xs text-muted-foreground/70">You can also paste just the <span className="font-mono">accessToken</span> JWT value directly.</p>
                <Textarea
                  placeholder='Paste the full JSON from chatgpt.com/api/auth/session here'
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  className="font-mono text-xs min-h-[110px] resize-none bg-input/30 border-border/40"
                  data-testid="textarea-auth-json"
                />
                {jsonError && (
                  <div className="flex items-center gap-1.5 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{jsonError}</span>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button
                    onClick={handleValidateJson}
                    disabled={!jsonText.trim()}
                    className="px-6 font-semibold"
                    data-testid="button-validate-json"
                  >
                    Validate
                  </Button>
                </div>
              </div>

              <Separator className="bg-border/30" />

              <div className="p-4">
                <Button
                  onClick={handleActivate}
                  disabled={currentStep < 3 || isPending}
                  className="w-full h-12 text-base font-bold gap-2 disabled:opacity-40"
                  data-testid="button-activate"
                >
                  <Zap className="w-5 h-5" />
                  {isPending ? "Activating..." : "Activate"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isPending && !showActivationResult && (
          <div className="max-w-2xl mx-auto w-full flex flex-col items-center justify-center py-8 space-y-4">
            <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            <p className="text-muted-foreground animate-pulse text-sm">
              Activating subscription...
            </p>
          </div>
        )}

        {showActivationResult && (
          <Card
            className="max-w-2xl mx-auto w-full border-border/40 bg-card/70 overflow-hidden animate-in fade-in zoom-in-95 duration-500"
            data-testid="activation-result"
          >
            <CardContent className="p-6 space-y-6">
              {activationResult?.success ? (
                <>
                  <div className="bg-primary/10 border border-primary/20 rounded-xl p-6 text-center space-y-2">
                    <div className="mx-auto w-12 h-12 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-3">
                      <Check className="w-6 h-6 stroke-[2.5]" />
                    </div>
                    <h3 className="text-primary font-bold text-xl">
                      Activation Successful
                    </h3>
                    {activationResult.message && (
                      <p className="text-primary/70 text-sm">
                        {activationResult.message}
                      </p>
                    )}
                  </div>

                  {activationResult.data && (
                    <div className="bg-secondary/50 rounded-lg border border-border/40 divide-y divide-border/30 text-sm">
                      {activationResult.data.email && (
                        <div className="flex justify-between items-center px-4 py-3">
                          <span className="text-muted-foreground">Account</span>
                          <span className="font-medium" data-testid="text-activated-email">
                            {activationResult.data.email}
                          </span>
                        </div>
                      )}
                      {activationResult.data.product && (
                        <div className="flex justify-between items-center px-4 py-3">
                          <span className="text-muted-foreground">Product</span>
                          <span className="font-medium" data-testid="text-activated-product">
                            {activationResult.data.product}
                          </span>
                        </div>
                      )}
                      {activationResult.data.subscription && (
                        <div className="flex justify-between items-center px-4 py-3">
                          <span className="text-muted-foreground">Subscription</span>
                          <Badge
                            className="bg-primary/20 text-primary border-primary/30"
                            data-testid="text-activated-subscription"
                          >
                            {activationResult.data.subscription}
                          </Badge>
                        </div>
                      )}
                      {activationResult.data.status && (
                        <div className="flex justify-between items-center px-4 py-3">
                          <span className="text-muted-foreground">Status</span>
                          <span className="capitalize" data-testid="text-activated-status">
                            {activationResult.data.status}
                          </span>
                        </div>
                      )}
                      {activationResult.data.activated_at && (
                        <div className="flex justify-between items-center px-4 py-3">
                          <span className="text-muted-foreground">Activated</span>
                          <span data-testid="text-activated-date">
                            {format(
                              new Date(activationResult.data.activated_at),
                              "PPP p"
                            )}
                          </span>
                        </div>
                      )}
                      {activationResult.data.message && (
                        <div className="flex justify-between items-start px-4 py-3">
                          <span className="text-muted-foreground">Message</span>
                          <span className="text-right max-w-[60%]">
                            {activationResult.data.message}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {activationResult.warning && (
                    <Alert className="bg-amber-500/10 text-amber-400 border-amber-500/20">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Warning</AlertTitle>
                      <AlertDescription>
                        {activationResult.warning}
                      </AlertDescription>
                    </Alert>
                  )}

                  <Alert className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Next step</AlertTitle>
                    <AlertDescription>
                      After activation, try refreshing the ChatGPT page multiple
                      times. The page will refresh itself to update the
                      subscription status.
                    </AlertDescription>
                  </Alert>

                  <Button
                    variant="outline"
                    className="w-full h-11"
                    onClick={handleReset}
                    data-testid="button-activate-another"
                  >
                    Activate Another Key
                  </Button>
                </>
              ) : (
                <>
                  <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 text-center space-y-3">
                    <div className="mx-auto w-12 h-12 bg-destructive/20 text-destructive rounded-full flex items-center justify-center mb-2">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <h3 className="text-destructive font-bold text-xl">
                      Activation Failed
                    </h3>
                    <p
                      className="text-destructive/80 text-sm"
                      data-testid="text-activation-error"
                    >
                      {activationResult?.message ||
                        (activateMutation.error as { error?: string })?.error ||
                        "An unexpected error occurred. Please try again."}
                    </p>
                    {(() => {
                      const msg = (activationResult?.message || "").toLowerCase();
                      if (msg.includes("token") || msg.includes("session")) {
                        return (
                          <p className="text-sm text-muted-foreground pt-1">
                            Your session token is <strong>invalid or expired</strong>. Tokens expire quickly — you must get a <strong>fresh one right now</strong>. Click "Fix My Session", open the{" "}
                            <a
                              href="https://chatgpt.com/api/auth/session"
                              target="_blank"
                              rel="noreferrer"
                              className="underline text-primary"
                            >
                              AuthSession page
                            </a>
                            , press Ctrl+A &rarr; Ctrl+C, and paste the new content.
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className="flex gap-3">
                    {(() => {
                      const msg = (activationResult?.message || "").toLowerCase();
                      if (msg.includes("token") || msg.includes("session")) {
                        return (
                          <Button
                            variant="outline"
                            className="flex-1 h-11"
                            onClick={() => {
                              activateMutation.reset();
                              setUserToken("");
                              setJsonText("");
                              setJsonError("");
                              setCurrentStep(2);
                            }}
                            data-testid="button-fix-session"
                          >
                            Fix My Session
                          </Button>
                        );
                      }
                      return null;
                    })()}
                    <Button
                      className="flex-1 h-11"
                      onClick={() => {
                        activateMutation.reset();
                      }}
                      data-testid="button-try-again"
                    >
                      Try Again
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {ordersData?.data && ordersData.data.length > 0 && (
          <Collapsible
            open={ordersOpen}
            onOpenChange={setOrdersOpen}
            className="max-w-2xl mx-auto w-full"
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full flex justify-between items-center py-5 bg-secondary/20 hover:bg-secondary/40 border border-border/40 rounded-lg"
                data-testid="button-toggle-orders"
              >
                <span className="font-semibold text-sm">Recent Orders</span>
                {ordersOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {ordersData.data.map((order) => (
                <Card
                  key={order.order_number}
                  className="bg-card/50 border-border/30"
                  data-testid={`card-order-${order.order_number}`}
                >
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-primary">
                          #{order.order_number}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {order.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {order.product} · {order.subscription}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm">
                        ${order.amount.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(order.created_at), "MMM d, yyyy")}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </main>

      {/* Success Modal — custom overlay, no Radix Dialog */}
      {showSuccessModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          data-testid="modal-activation-success"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSuccessModal(false); }}
        >
          <div className="relative mx-4 w-full max-w-sm rounded-2xl bg-[#0d1117] border border-border/40 overflow-hidden shadow-2xl">
            <div className="flex flex-col items-center px-8 pt-10 pb-8 gap-5 text-center">
              {/* Green glow checkmark */}
              <div className="relative flex items-center justify-center">
                <div className="absolute w-24 h-24 rounded-full bg-green-500/20 blur-xl" />
                <div className="relative w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,0.5)]">
                  <Check className="w-9 h-9 text-white stroke-[3]" />
                </div>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">
                  Activation Successful!
                </h2>
                <p className="text-muted-foreground text-sm">
                  Your subscription has been activated successfully.
                </p>
              </div>

              {/* Email pill */}
              {activationResult?.data?.email && (
                <div className="flex items-center gap-2.5 px-5 py-3 rounded-full border border-green-500/40 bg-green-500/10 text-green-400 font-medium text-sm w-full justify-center">
                  <Mail className="w-4 h-4 shrink-0" />
                  <span data-testid="modal-activated-email">{activationResult.data.email}</span>
                </div>
              )}

              {/* Subscription info */}
              {activationResult?.data?.subscription && (
                <p className="text-xs text-muted-foreground">
                  {activationResult.data.subscription}
                </p>
              )}

              {/* Buttons */}
              <div className="flex gap-3 w-full pt-1">
                <Button
                  variant="secondary"
                  className="flex-1 h-12 text-base font-semibold bg-secondary/70 hover:bg-secondary"
                  onClick={() => setShowSuccessModal(false)}
                  data-testid="modal-button-close"
                >
                  Close
                </Button>
                <Button
                  className="flex-1 h-12 text-base font-semibold bg-green-500 hover:bg-green-600 text-white gap-2"
                  onClick={handleReset}
                  data-testid="modal-button-one-more"
                >
                  <RefreshCw className="w-4 h-4" />
                  One More
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
