/**
 * Domain Admin Invoice Settings Page
 * Allows domain admins to configure their own invoice header info
 * This overrides the global platform invoice settings for this tenant/domain
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
import { toast } from "sonner";
import {
  FileText,
  Save,
  Loader2,
  ChevronLeft,
  Building2,
  Plus,
  Trash2,
  Info,
} from "lucide-react";

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

export default function DomainAdminInvoice() {
  const { user, isLoading: authLoading } = useAuth();
  const { tenant } = useTenant();
  const [, setLocation] = useLocation();

  // Invoice config state
  const [invoiceForm, setInvoiceForm] = useState<InvoiceConfig>({
    customFields: [],
  });

  // Query tenant-specific invoice config
  const { data: invoiceConfig, isLoading: invoiceLoading, refetch: refetchInvoice } =
    trpc.systemSettings.getTenantInvoiceConfig.useQuery(
      { tenantId: tenant?.id || 0 },
      {
        enabled: !!user && !!tenant?.id && (user.role === "domain_admin" || user.role === "admin"),
      }
    );

  // Mutation
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
    if (invoiceConfig) {
      setInvoiceForm(invoiceConfig);
    }
  }, [invoiceConfig]);

  // Redirect if not domain admin
  useEffect(() => {
    if (!authLoading && (!user || (user.role !== "domain_admin" && user.role !== "admin"))) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation]);

  if (authLoading || !user || (user.role !== "domain_admin" && user.role !== "admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  const handleSaveInvoice = () => {
    if (!tenant?.id) {
      toast.error("No tenant ID found. Please ensure your domain is configured.");
      return;
    }

    upsertInvoiceMutation.mutate({
      tenantId: tenant.id,
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 px-4 sm:px-6 lg:px-8 py-6">
      <div className="">
        {/* Header */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/domain-admin")}
          className="text-gray-600 mb-4"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Back to Domain Admin
        </Button>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <FileText className="w-8 h-8 text-purple-500" />
              Invoice Settings
            </h1>
            <p className="text-gray-600 mt-2">
              Configure your company information for invoices
            </p>
          </div>
          {tenant && (
            <Badge variant="outline" className="text-purple-600 border-purple-600">
              <Building2 className="w-3 h-3 mr-1" />
              {tenant.domain}
            </Badge>
          )}
        </div>

        {/* Info Banner */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">White Label Invoice Configuration</p>
            <p className="mt-1">
              These settings override the platform defaults. Invoices generated for users in your domain
              will use this company information instead of the platform&apos;s default.
            </p>
          </div>
        </div>

        {/* Invoice Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-500" />
              Invoice Configuration
            </CardTitle>
            <CardDescription>
              Configure the company information that appears on invoices for your domain users.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {invoiceLoading ? (
              <div className="py-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto" />
                <p className="text-gray-500 mt-2">Loading invoice settings...</p>
              </div>
            ) : (
              <>
                {/* Company Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      placeholder="Your Company Inc."
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
                        placeholder="Your Company Inc."
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
                    disabled={upsertInvoiceMutation.isPending || !tenant?.id}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {upsertInvoiceMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Invoice Settings
                  </Button>
                  {!tenant?.id && (
                    <p className="text-sm text-amber-600 mt-2">
                      Your domain is not yet configured. Please contact support.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
