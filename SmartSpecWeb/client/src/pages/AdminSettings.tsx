/**
 * Admin Settings Page
 * Manage platform configuration: Stripe, Invoice, etc.
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { trpc } from "../lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Settings,
  CreditCard,
  FileText,
  Key,
  Check,
  X,
  Save,
  TestTube,
  Loader2,
  ChevronLeft,
  Eye,
  EyeOff,
  Building2,
  Globe,
  Phone,
  Mail,
  MapPin,
  Plus,
  Trash2,
  Users,
} from "lucide-react";

interface StripeSettings {
  secretKey?: string;
  secretKeyConfigured?: string;
  publishableKey?: string;
  webhookSecret?: string;
  webhookSecretConfigured?: string;
  currency?: string;
}

interface InvoiceConfig {
  id?: number;
  tenantId?: number | null;
  companyName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  website?: string;
  logoUrl?: string;
  footerText?: string;
  termsText?: string;
  bankDetails?: {
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    routingNumber?: string;
    swiftCode?: string;
    iban?: string;
  };
  customFields?: Array<{ label: string; value: string }>;
  isActive?: boolean;
}

export default function AdminSettings() {
  const { user, isLoading: authLoading } = useAuth();
  const { tenant } = useTenant();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("stripe");

  // Tenant selection for invoice config
  // domain_admin: auto-set to their tenant; admin: can pick or use global (null)
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);

  // Stripe settings state
  const [stripeForm, setStripeForm] = useState<StripeSettings>({
    currency: "usd",
  });
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);

  // Invoice config state
  const [invoiceForm, setInvoiceForm] = useState<InvoiceConfig>({
    customFields: [],
  });

  // OAuth settings state
  const [oauthForm, setOauthForm] = useState<{
    googleClientId?: string;
    googleClientSecret?: string;
    googleRedirectUri?: string;
    githubClientId?: string;
    githubClientSecret?: string;
    githubRedirectUri?: string;
  }>({});
  const [showGoogleSecret, setShowGoogleSecret] = useState(false);
  const [showGithubSecret, setShowGithubSecret] = useState(false);
  const [googleSecretConfigured, setGoogleSecretConfigured] = useState(false);
  const [githubSecretConfigured, setGithubSecretConfigured] = useState(false);

  // Queries
  const { data: stripeSettings, isLoading: stripeLoading, refetch: refetchStripe } =
    trpc.systemSettings.getStripeSettings.useQuery(undefined, {
      enabled: !!user && user.role === "admin",
    });

  // Invoice: global config (when no tenant selected)
  const { data: globalInvoiceConfig, refetch: refetchGlobalInvoice } =
    trpc.systemSettings.getGlobalInvoiceConfig.useQuery(undefined, {
      enabled: !!user && (user.role === "admin" || user.role === "domain_admin") && selectedTenantId === null,
    });

  // Invoice: tenant-specific config
  const { data: tenantInvoiceConfig, refetch: refetchTenantInvoice } =
    trpc.systemSettings.getTenantInvoiceConfig.useQuery(
      { tenantId: selectedTenantId! },
      {
        enabled: !!user && (user.role === "admin" || user.role === "domain_admin") && selectedTenantId !== null,
      }
    );

  // Tenants list for admin selector
  const { data: allTenants } = trpc.systemSettings.listTenants.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  const invoiceConfig = selectedTenantId !== null ? tenantInvoiceConfig : globalInvoiceConfig;
  const refetchInvoice = selectedTenantId !== null ? refetchTenantInvoice : refetchGlobalInvoice;

  // Mutations
  const updateStripeMutation = trpc.systemSettings.updateStripeSettings.useMutation({
    onSuccess: () => {
      toast.success("Stripe settings saved successfully");
      refetchStripe();
    },
    onError: (err) => {
      toast.error(`Failed to save Stripe settings: ${err.message}`);
    },
  });

  const testStripeMutation = trpc.systemSettings.testStripeConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    },
    onError: (err) => {
      toast.error(`Test failed: ${err.message}`);
    },
  });

  const upsertInvoiceMutation = trpc.systemSettings.upsertInvoiceConfig.useMutation({
    onSuccess: (data) => {
      toast.success(data.updated ? "Invoice settings updated" : "Invoice settings created");
      refetchInvoice();
    },
    onError: (err) => {
      toast.error(`Failed to save invoice settings: ${err.message}`);
    },
  });

  // OAuth queries & mutations
  const { data: oauthSettings, isLoading: oauthLoading, refetch: refetchOAuth } =
    trpc.systemSettings.getOAuthSettings.useQuery(undefined, {
      enabled: !!user && user.role === "admin",
    });

  const updateOAuthMutation = trpc.systemSettings.updateOAuthSettings.useMutation({
    onSuccess: () => {
      toast.success("OAuth settings saved successfully");
      refetchOAuth();
      setOauthForm((prev) => ({ ...prev, googleClientSecret: undefined, githubClientSecret: undefined }));
    },
    onError: (err) => {
      toast.error(`Failed to save OAuth settings: ${err.message}`);
    },
  });

  // Load settings into form
  useEffect(() => {
    if (stripeSettings) {
      setStripeForm({
        publishableKey: stripeSettings.publishableKey || "",
        currency: stripeSettings.currency || "usd",
        secretKeyConfigured: stripeSettings.secretKeyConfigured,
        webhookSecretConfigured: stripeSettings.webhookSecretConfigured,
      });
    }
  }, [stripeSettings]);

  useEffect(() => {
    if (invoiceConfig) {
      setInvoiceForm(invoiceConfig);
    }
  }, [invoiceConfig]);

  useEffect(() => {
    if (oauthSettings) {
      setOauthForm({
        googleClientId: (oauthSettings.googleClientId as string) || "",
        googleRedirectUri: (oauthSettings.googleRedirectUri as string) || "",
        githubClientId: (oauthSettings.githubClientId as string) || "",
        githubRedirectUri: (oauthSettings.githubRedirectUri as string) || "",
      });
      setGoogleSecretConfigured(!!oauthSettings.googleClientSecretConfigured);
      setGithubSecretConfigured(!!oauthSettings.githubClientSecretConfigured);
    }
  }, [oauthSettings]);

  const isAdmin = user?.role === "admin";
  const isDomainAdmin = user?.role === "domain_admin";
  const hasAccess = isAdmin || isDomainAdmin;

  // Redirect if not admin or domain_admin
  useEffect(() => {
    if (!authLoading && !hasAccess) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation, hasAccess]);

  // Domain admins: default to invoice tab and auto-select their tenant
  useEffect(() => {
    if (isDomainAdmin && !isAdmin) {
      if (activeTab !== "invoice") setActiveTab("invoice");
      if (tenant?.id && selectedTenantId === null) setSelectedTenantId(tenant.id);
    }
  }, [isDomainAdmin, isAdmin]);

  if (authLoading || !user || !hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  const handleSaveStripe = () => {
    updateStripeMutation.mutate({
      secretKey: stripeForm.secretKey,
      publishableKey: stripeForm.publishableKey,
      webhookSecret: stripeForm.webhookSecret,
      currency: stripeForm.currency,
    });
  };

  const handleSaveOAuth = () => {
    updateOAuthMutation.mutate({
      googleClientId: oauthForm.googleClientId,
      googleClientSecret: oauthForm.googleClientSecret,
      googleRedirectUri: oauthForm.googleRedirectUri,
      githubClientId: oauthForm.githubClientId,
      githubClientSecret: oauthForm.githubClientSecret,
      githubRedirectUri: oauthForm.githubRedirectUri,
    });
  };

  const handleSaveInvoice = () => {
    upsertInvoiceMutation.mutate({
      tenantId: selectedTenantId,
      ...invoiceForm,
    });
  };

  const addCustomField = () => {
    setInvoiceForm((prev) => ({
      ...prev,
      customFields: [...(prev.customFields || []), { label: "", value: "" }],
    }));
  };

  const removeCustomField = (index: number) => {
    setInvoiceForm((prev) => ({
      ...prev,
      customFields: prev.customFields?.filter((_, i) => i !== index),
    }));
  };

  const updateCustomField = (index: number, field: "label" | "value", value: string) => {
    setInvoiceForm((prev) => ({
      ...prev,
      customFields: prev.customFields?.map((f, i) =>
        i === index ? { ...f, [field]: value } : f
      ),
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/dashboard")}
          className="text-gray-600 mb-4"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Back to Dashboard
        </Button>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Settings className="w-8 h-8 text-purple-500" />
              Platform Settings
            </h1>
            <p className="text-gray-600 mt-2">Configure Stripe payments and invoice settings</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            {isAdmin && (
              <TabsTrigger value="stripe" className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Stripe Payments
              </TabsTrigger>
            )}
            <TabsTrigger value="invoice" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Invoice Settings
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="oauth" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                OAuth / Social Login
              </TabsTrigger>
            )}
          </TabsList>

          {/* Stripe Settings Tab */}
          <TabsContent value="stripe">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-purple-500" />
                  Stripe Configuration
                </CardTitle>
                <CardDescription>
                  Configure your Stripe API keys for payment processing. Get your keys from the{" "}
                  <a
                    href="https://dashboard.stripe.com/apikeys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:underline"
                  >
                    Stripe Dashboard
                  </a>
                  .
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Publishable Key */}
                <div>
                  <Label htmlFor="publishableKey">Publishable Key</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="publishableKey"
                      placeholder="pk_test_..."
                      value={stripeForm.publishableKey || ""}
                      onChange={(e) =>
                        setStripeForm((prev) => ({ ...prev, publishableKey: e.target.value }))
                      }
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Used in the frontend for Stripe.js integration
                  </p>
                </div>

                {/* Secret Key */}
                <div>
                  <Label htmlFor="secretKey">
                    Secret Key
                    {stripeForm.secretKeyConfigured && (
                      <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                        <Check className="w-3 h-3 mr-1" />
                        Configured
                      </Badge>
                    )}
                  </Label>
                  <div className="flex gap-2 mt-1">
                    <div className="relative flex-1">
                      <Input
                        id="secretKey"
                        type={showSecretKey ? "text" : "password"}
                        placeholder={stripeForm.secretKeyConfigured ? "Enter new key to update..." : "sk_test_..."}
                        value={stripeForm.secretKey || ""}
                        onChange={(e) =>
                          setStripeForm((prev) => ({ ...prev, secretKey: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowSecretKey(!showSecretKey)}
                      >
                        {showSecretKey ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Keep this secret. Never expose in frontend code.
                  </p>
                </div>

                {/* Webhook Secret */}
                <div>
                  <Label htmlFor="webhookSecret">
                    Webhook Secret
                    {stripeForm.webhookSecretConfigured && (
                      <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                        <Check className="w-3 h-3 mr-1" />
                        Configured
                      </Badge>
                    )}
                  </Label>
                  <div className="flex gap-2 mt-1">
                    <div className="relative flex-1">
                      <Input
                        id="webhookSecret"
                        type={showWebhookSecret ? "text" : "password"}
                        placeholder={stripeForm.webhookSecretConfigured ? "Enter new secret to update..." : "whsec_..."}
                        value={stripeForm.webhookSecret || ""}
                        onChange={(e) =>
                          setStripeForm((prev) => ({ ...prev, webhookSecret: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                      >
                        {showWebhookSecret ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Required for receiving Stripe webhook events
                  </p>
                </div>

                {/* Currency */}
                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select
                    value={stripeForm.currency || "usd"}
                    onValueChange={(value) =>
                      setStripeForm((prev) => ({ ...prev, currency: value }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usd">USD - US Dollar</SelectItem>
                      <SelectItem value="eur">EUR - Euro</SelectItem>
                      <SelectItem value="gbp">GBP - British Pound</SelectItem>
                      <SelectItem value="thb">THB - Thai Baht</SelectItem>
                      <SelectItem value="jpy">JPY - Japanese Yen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    onClick={handleSaveStripe}
                    disabled={updateStripeMutation.isPending}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {updateStripeMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Settings
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => testStripeMutation.mutate()}
                    disabled={testStripeMutation.isPending}
                  >
                    {testStripeMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <TestTube className="w-4 h-4 mr-2" />
                    )}
                    Test Connection
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoice Settings Tab */}
          <TabsContent value="invoice">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-500" />
                  Invoice Configuration
                  {selectedTenantId !== null && (
                    <Badge variant="secondary" className="ml-2">Tenant-specific</Badge>
                  )}
                  {selectedTenantId === null && isAdmin && (
                    <Badge variant="outline" className="ml-2">Global Default</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {isDomainAdmin && !isAdmin
                    ? "Configure your domain's company information for invoices."
                    : "Configure invoice settings. Select a tenant for tenant-specific config, or use Global Default."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Tenant Selector (admin only) */}
                {isAdmin && (
                  <div className="pb-4 border-b">
                    <Label>Invoice Config Scope</Label>
                    <Select
                      value={selectedTenantId === null ? "global" : String(selectedTenantId)}
                      onValueChange={(val) => {
                        const tid = val === "global" ? null : Number(val);
                        setSelectedTenantId(tid);
                        setInvoiceForm({ customFields: [] });
                      }}
                    >
                      <SelectTrigger className="w-full mt-1">
                        <SelectValue placeholder="Select scope" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">
                          <span className="flex items-center gap-2">
                            <Globe className="w-4 h-4" /> Global Default
                          </span>
                        </SelectItem>
                        {allTenants?.map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            <span className="flex items-center gap-2">
                              <Building2 className="w-4 h-4" /> {t.name} ({t.domain})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1">
                      Tenant-specific settings override global defaults when generating invoices for that domain.
                    </p>
                  </div>
                )}
                {/* Company Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      placeholder="SmartSpec Pro Inc."
                      value={invoiceForm.companyName || ""}
                      onChange={(e) =>
                        setInvoiceForm((prev) => ({ ...prev, companyName: e.target.value }))
                      }
                    />
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="addressLine1">Address Line 1</Label>
                    <Input
                      id="addressLine1"
                      placeholder="123 Main Street"
                      value={invoiceForm.addressLine1 || ""}
                      onChange={(e) =>
                        setInvoiceForm((prev) => ({ ...prev, addressLine1: e.target.value }))
                      }
                    />
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="addressLine2">Address Line 2 (optional)</Label>
                    <Input
                      id="addressLine2"
                      placeholder="Suite 100"
                      value={invoiceForm.addressLine2 || ""}
                      onChange={(e) =>
                        setInvoiceForm((prev) => ({ ...prev, addressLine2: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      placeholder="San Francisco"
                      value={invoiceForm.city || ""}
                      onChange={(e) =>
                        setInvoiceForm((prev) => ({ ...prev, city: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="state">State/Province</Label>
                    <Input
                      id="state"
                      placeholder="CA"
                      value={invoiceForm.state || ""}
                      onChange={(e) =>
                        setInvoiceForm((prev) => ({ ...prev, state: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="postalCode">Postal Code</Label>
                    <Input
                      id="postalCode"
                      placeholder="94105"
                      value={invoiceForm.postalCode || ""}
                      onChange={(e) =>
                        setInvoiceForm((prev) => ({ ...prev, postalCode: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      placeholder="United States"
                      value={invoiceForm.country || ""}
                      onChange={(e) =>
                        setInvoiceForm((prev) => ({ ...prev, country: e.target.value }))
                      }
                    />
                  </div>
                </div>

                {/* Contact Info */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <Label htmlFor="taxId">Tax ID / VAT Number</Label>
                    <Input
                      id="taxId"
                      placeholder="XX-XXXXXXX"
                      value={invoiceForm.taxId || ""}
                      onChange={(e) =>
                        setInvoiceForm((prev) => ({ ...prev, taxId: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="invoiceEmail">Email</Label>
                    <Input
                      id="invoiceEmail"
                      type="email"
                      placeholder="billing@company.com"
                      value={invoiceForm.email || ""}
                      onChange={(e) =>
                        setInvoiceForm((prev) => ({ ...prev, email: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      placeholder="+1 (555) 123-4567"
                      value={invoiceForm.phone || ""}
                      onChange={(e) =>
                        setInvoiceForm((prev) => ({ ...prev, phone: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      placeholder="https://company.com"
                      value={invoiceForm.website || ""}
                      onChange={(e) =>
                        setInvoiceForm((prev) => ({ ...prev, website: e.target.value }))
                      }
                    />
                  </div>
                </div>

                {/* Logo URL */}
                <div className="pt-4 border-t">
                  <Label htmlFor="logoUrl">Logo URL</Label>
                  <Input
                    id="logoUrl"
                    placeholder="https://company.com/logo.png"
                    value={invoiceForm.logoUrl || ""}
                    onChange={(e) =>
                      setInvoiceForm((prev) => ({ ...prev, logoUrl: e.target.value }))
                    }
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    URL to your company logo (recommended: 200x50px PNG)
                  </p>
                </div>

                {/* Footer & Terms */}
                <div className="grid grid-cols-1 gap-4 pt-4 border-t">
                  <div>
                    <Label htmlFor="footerText">Invoice Footer</Label>
                    <Textarea
                      id="footerText"
                      placeholder="Thank you for your business!"
                      value={invoiceForm.footerText || ""}
                      onChange={(e) =>
                        setInvoiceForm((prev) => ({ ...prev, footerText: e.target.value }))
                      }
                      rows={2}
                    />
                  </div>

                  <div>
                    <Label htmlFor="termsText">Terms & Conditions</Label>
                    <Textarea
                      id="termsText"
                      placeholder="Payment is due within 30 days..."
                      value={invoiceForm.termsText || ""}
                      onChange={(e) =>
                        setInvoiceForm((prev) => ({ ...prev, termsText: e.target.value }))
                      }
                      rows={3}
                    />
                  </div>
                </div>

                {/* Bank Details */}
                <div className="pt-4 border-t">
                  <h3 className="text-sm font-medium mb-3">Bank Details (for wire transfers)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="bankName">Bank Name</Label>
                      <Input
                        id="bankName"
                        placeholder="First National Bank"
                        value={invoiceForm.bankDetails?.bankName || ""}
                        onChange={(e) =>
                          setInvoiceForm((prev) => ({
                            ...prev,
                            bankDetails: { ...prev.bankDetails, bankName: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="accountName">Account Name</Label>
                      <Input
                        id="accountName"
                        placeholder="SmartSpec Pro Inc."
                        value={invoiceForm.bankDetails?.accountName || ""}
                        onChange={(e) =>
                          setInvoiceForm((prev) => ({
                            ...prev,
                            bankDetails: { ...prev.bankDetails, accountName: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="accountNumber">Account Number</Label>
                      <Input
                        id="accountNumber"
                        placeholder="XXXXXXXXXX"
                        value={invoiceForm.bankDetails?.accountNumber || ""}
                        onChange={(e) =>
                          setInvoiceForm((prev) => ({
                            ...prev,
                            bankDetails: { ...prev.bankDetails, accountNumber: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="routingNumber">Routing Number</Label>
                      <Input
                        id="routingNumber"
                        placeholder="XXXXXXXXX"
                        value={invoiceForm.bankDetails?.routingNumber || ""}
                        onChange={(e) =>
                          setInvoiceForm((prev) => ({
                            ...prev,
                            bankDetails: { ...prev.bankDetails, routingNumber: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="swiftCode">SWIFT Code</Label>
                      <Input
                        id="swiftCode"
                        placeholder="XXXXXXXX"
                        value={invoiceForm.bankDetails?.swiftCode || ""}
                        onChange={(e) =>
                          setInvoiceForm((prev) => ({
                            ...prev,
                            bankDetails: { ...prev.bankDetails, swiftCode: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="iban">IBAN</Label>
                      <Input
                        id="iban"
                        placeholder="XX00 XXXX XXXX XXXX XXXX"
                        value={invoiceForm.bankDetails?.iban || ""}
                        onChange={(e) =>
                          setInvoiceForm((prev) => ({
                            ...prev,
                            bankDetails: { ...prev.bankDetails, iban: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>

                {/* Custom Fields */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium">Custom Fields</h3>
                    <Button variant="outline" size="sm" onClick={addCustomField}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add Field
                    </Button>
                  </div>
                  {invoiceForm.customFields?.map((field, index) => (
                    <div key={index} className="flex gap-2 mb-2">
                      <Input
                        placeholder="Label"
                        value={field.label}
                        onChange={(e) => updateCustomField(index, "label", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Value"
                        value={field.value}
                        onChange={(e) => updateCustomField(index, "value", e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeCustomField(index)}
                        className="text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Save Button */}
                <div className="pt-4 border-t">
                  <Button
                    onClick={handleSaveInvoice}
                    disabled={upsertInvoiceMutation.isPending}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {upsertInvoiceMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Invoice Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          {/* OAuth Settings Tab */}
          <TabsContent value="oauth">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-500" />
                  OAuth / Social Login Configuration
                </CardTitle>
                <CardDescription>
                  Configure Google and GitHub OAuth credentials for social login.
                  Users will be able to sign in with these providers once configured.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Google OAuth */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    Google OAuth
                  </h3>
                  <div>
                    <Label htmlFor="googleClientId">Client ID</Label>
                    <Input
                      id="googleClientId"
                      placeholder="xxxxx.apps.googleusercontent.com"
                      value={oauthForm.googleClientId || ""}
                      onChange={(e) =>
                        setOauthForm((prev) => ({ ...prev, googleClientId: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="googleClientSecret">
                      Client Secret
                      {googleSecretConfigured && (
                        <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                          <Check className="w-3 h-3 mr-1" />
                          Configured
                        </Badge>
                      )}
                    </Label>
                    <div className="relative">
                      <Input
                        id="googleClientSecret"
                        type={showGoogleSecret ? "text" : "password"}
                        placeholder={googleSecretConfigured ? "Enter new secret to update..." : "GOCSPX-..."}
                        value={oauthForm.googleClientSecret || ""}
                        onChange={(e) =>
                          setOauthForm((prev) => ({ ...prev, googleClientSecret: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowGoogleSecret(!showGoogleSecret)}
                      >
                        {showGoogleSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="googleRedirectUri">Redirect URI</Label>
                    <Input
                      id="googleRedirectUri"
                      placeholder="http://localhost:3000/auth/callback/google"
                      value={oauthForm.googleRedirectUri || ""}
                      onChange={(e) =>
                        setOauthForm((prev) => ({ ...prev, googleRedirectUri: e.target.value }))
                      }
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Must match the authorized redirect URI in Google Cloud Console
                    </p>
                  </div>
                </div>

                {/* GitHub OAuth */}
                <div className="space-y-4 pt-6 border-t">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Key className="w-5 h-5" />
                    GitHub OAuth
                  </h3>
                  <div>
                    <Label htmlFor="githubClientId">Client ID</Label>
                    <Input
                      id="githubClientId"
                      placeholder="Iv1.xxxxxxxxxxxxxxxx"
                      value={oauthForm.githubClientId || ""}
                      onChange={(e) =>
                        setOauthForm((prev) => ({ ...prev, githubClientId: e.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="githubClientSecret">
                      Client Secret
                      {githubSecretConfigured && (
                        <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                          <Check className="w-3 h-3 mr-1" />
                          Configured
                        </Badge>
                      )}
                    </Label>
                    <div className="relative">
                      <Input
                        id="githubClientSecret"
                        type={showGithubSecret ? "text" : "password"}
                        placeholder={githubSecretConfigured ? "Enter new secret to update..." : "Enter GitHub client secret"}
                        value={oauthForm.githubClientSecret || ""}
                        onChange={(e) =>
                          setOauthForm((prev) => ({ ...prev, githubClientSecret: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowGithubSecret(!showGithubSecret)}
                      >
                        {showGithubSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="githubRedirectUri">Redirect URI</Label>
                    <Input
                      id="githubRedirectUri"
                      placeholder="http://localhost:3000/auth/callback/github"
                      value={oauthForm.githubRedirectUri || ""}
                      onChange={(e) =>
                        setOauthForm((prev) => ({ ...prev, githubRedirectUri: e.target.value }))
                      }
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Must match the authorization callback URL in GitHub OAuth App settings
                    </p>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    onClick={handleSaveOAuth}
                    disabled={updateOAuthMutation.isPending}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {updateOAuthMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save OAuth Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
