/**
 * Admin Settings Page
 * Manage platform configuration: Stripe, Invoice, etc.
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
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
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("stripe");

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

  // Queries
  const { data: stripeSettings, isLoading: stripeLoading, refetch: refetchStripe } =
    trpc.systemSettings.getStripeSettings.useQuery(undefined, {
      enabled: !!user && user.role === "admin",
    });

  const { data: invoiceConfig, isLoading: invoiceLoading, refetch: refetchInvoice } =
    trpc.systemSettings.getGlobalInvoiceConfig.useQuery(undefined, {
      enabled: !!user && user.role === "admin",
    });

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

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  if (authLoading || !user || user.role !== "admin") {
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

  const handleSaveInvoice = () => {
    upsertInvoiceMutation.mutate({
      tenantId: null, // Global config
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
            <TabsTrigger value="stripe" className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Stripe Payments
            </TabsTrigger>
            <TabsTrigger value="invoice" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Invoice Settings
            </TabsTrigger>
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
                </CardTitle>
                <CardDescription>
                  Configure the default company information that appears on invoices.
                  White Label tenants can override these settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
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
        </Tabs>
      </div>
    </div>
  );
}
