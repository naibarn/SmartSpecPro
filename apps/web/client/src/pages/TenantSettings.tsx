/**
 * Tenant Settings Page
 * Domain admin settings: Invoice, and future tenant-specific configurations
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { trpc } from "../lib/trpc";
import { LocaleToggle } from "@/components/LocaleToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardCard } from "@/components/dashboard";
import { toast } from "sonner";
import {
  Settings,
  FileText,
  Save,
  Loader2,
  ChevronLeft,
  Building2,
  Plus,
  Trash2,
} from "lucide-react";

interface InvoiceConfig {
  id?: number;
  tenantId?: string | null;
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

export default function TenantSettings() {
  const { user, isLoading: authLoading } = useAuth();
  const { tenant } = useTenant();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("invoice");

  // Invoice config state
  const [invoiceForm, setInvoiceForm] = useState<InvoiceConfig>({
    customFields: [],
  });

  // Query tenant-specific invoice config
  const {
    data: invoiceConfig,
    isLoading: invoiceLoading,
    refetch: refetchInvoice,
  } = trpc.systemSettings.getTenantInvoiceConfig.useQuery(
    { tenantId: tenant?.id ?? "" },
    {
      enabled:
        !!user &&
        !!tenant?.id &&
        (user.role === "domain_admin" || user.role === "admin"),
    }
  );

  // Mutation
  const upsertInvoiceMutation =
    trpc.systemSettings.upsertInvoiceConfig.useMutation({
      onSuccess: data => {
        toast.success(
          data.updated ? "Invoice settings updated" : "Invoice settings created"
        );
        refetchInvoice();
      },
      onError: err => {
        toast.error(`Failed to save invoice settings: ${err.message}`);
      },
    });

  // Load settings into form
  useEffect(() => {
    if (invoiceConfig) {
      setInvoiceForm(invoiceConfig as InvoiceConfig);
    }
  }, [invoiceConfig]);

  const hasAccess = user?.role === "domain_admin" || user?.role === "admin";

  // Redirect if not authorized
  useEffect(() => {
    if (!authLoading && !hasAccess) {
      setLocation("/");
    }
  }, [user, authLoading, setLocation, hasAccess]);

  if (authLoading || !user || !hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const handleSaveInvoice = () => {
    if (!tenant?.id) {
      toast.error(
        "No tenant ID found. Please ensure your domain is configured."
      );
      return;
    }
    upsertInvoiceMutation.mutate({
      tenantId: tenant.id,
      ...invoiceForm,
    });
  };

  const addCustomField = () => {
    setInvoiceForm(prev => ({
      ...prev,
      customFields: [...(prev.customFields || []), { label: "", value: "" }],
    }));
  };

  const removeCustomField = (index: number) => {
    setInvoiceForm(prev => ({
      ...prev,
      customFields: prev.customFields?.filter((_, i) => i !== index),
    }));
  };

  const updateCustomField = (
    index: number,
    field: "label" | "value",
    value: string
  ) => {
    setInvoiceForm(prev => ({
      ...prev,
      customFields: prev.customFields?.map((f, i) =>
        i === index ? { ...f, [field]: value } : f
      ),
    }));
  };

  const navItems = [
    {
      key: "invoice",
      label: "Invoice",
      sublabel: "Company & Billing",
      icon: FileText,
    },
    // Future tabs can be added here, e.g.:
    // { key: "branding", label: "Branding", sublabel: "Logo & Colors", icon: Palette },
    // { key: "notifications", label: "Notifications", sublabel: "Email & Alerts", icon: Bell },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50/30">
      {/* Top Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/dashboard")}
              className="text-gray-500 hover:text-gray-900 -ml-2"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Dashboard
            </Button>
            <div className="h-5 w-px bg-gray-200" />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-cyan-500 to-teal-500 flex items-center justify-center shadow-md shadow-blue-200/50">
                <Settings className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">
                  Tenant Settings
                </h1>
                <p className="text-xs text-gray-500">
                  {tenant ? (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3" />{" "}
                      {tenant.name || "Your Domain"}
                    </span>
                  ) : (
                    "Configure your domain settings"
                  )}
                </p>
              </div>
            </div>
          </div>
          <LocaleToggle className="shrink-0" />
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Sidebar Navigation */}
          <nav className="w-56 flex-shrink-0">
            <div className="sticky top-24 space-y-1">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 ${
                      isActive
                        ? "bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 text-white shadow-md shadow-blue-200/50"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-white/90" : "text-gray-400"}`}
                    />
                    <div className="min-w-0">
                      <div
                        className={`text-sm font-medium truncate ${isActive ? "text-white" : ""}`}
                      >
                        {item.label}
                      </div>
                      <div
                        className={`text-xs truncate ${isActive ? "text-white/70" : "text-gray-400"}`}
                      >
                        {item.sublabel}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="hidden"></TabsList>

              {/* Invoice Settings Tab */}
              <TabsContent value="invoice">
                <DashboardCard
                  className="overflow-hidden"
                  title="Invoice Configuration"
                  description="Configure your domain's company information for invoices. These settings override the platform defaults."
                  leading={<FileText className="w-5 h-5 text-blue-500" />}
                >
                  {invoiceLoading ? (
                    <div className="py-8 text-center">
                      <Loader2 className="mx-auto mt-0 w-8 animate-spin text-blue-500 h-8" />
                      <p className="mt-2 text-gray-500">
                        Loading invoice settings...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* White Label Info */}
                      <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm space-y-1">
                        <p className="font-semibold text-blue-800">
                          White Label Invoice
                        </p>
                        <p className="text-blue-700 text-xs">
                          Invoices generated for users in your domain will use
                          this company information instead of the
                          platform&apos;s default.
                        </p>
                      </div>

                      {/* Company Info */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <Label htmlFor="companyName">Company Name</Label>
                          <Input
                            id="companyName"
                            placeholder="Your Company Inc."
                            value={invoiceForm.companyName || ""}
                            onChange={e =>
                              setInvoiceForm(prev => ({
                                ...prev,
                                companyName: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="col-span-2">
                          <Label htmlFor="addressLine1">Address Line 1</Label>
                          <Input
                            id="addressLine1"
                            placeholder="123 Main Street"
                            value={invoiceForm.addressLine1 || ""}
                            onChange={e =>
                              setInvoiceForm(prev => ({
                                ...prev,
                                addressLine1: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="col-span-2">
                          <Label htmlFor="addressLine2">
                            Address Line 2 (optional)
                          </Label>
                          <Input
                            id="addressLine2"
                            placeholder="Suite 100"
                            value={invoiceForm.addressLine2 || ""}
                            onChange={e =>
                              setInvoiceForm(prev => ({
                                ...prev,
                                addressLine2: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="city">City</Label>
                          <Input
                            id="city"
                            placeholder="San Francisco"
                            value={invoiceForm.city || ""}
                            onChange={e =>
                              setInvoiceForm(prev => ({
                                ...prev,
                                city: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="state">State/Province</Label>
                          <Input
                            id="state"
                            placeholder="CA"
                            value={invoiceForm.state || ""}
                            onChange={e =>
                              setInvoiceForm(prev => ({
                                ...prev,
                                state: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="postalCode">Postal Code</Label>
                          <Input
                            id="postalCode"
                            placeholder="94105"
                            value={invoiceForm.postalCode || ""}
                            onChange={e =>
                              setInvoiceForm(prev => ({
                                ...prev,
                                postalCode: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="country">Country</Label>
                          <Input
                            id="country"
                            placeholder="United States"
                            value={invoiceForm.country || ""}
                            onChange={e =>
                              setInvoiceForm(prev => ({
                                ...prev,
                                country: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      {/* Contact Info */}
                      <div className="grid grid-cols-2 gap-4 border-t pt-4">
                        <div>
                          <Label htmlFor="taxId">Tax ID / VAT Number</Label>
                          <Input
                            id="taxId"
                            placeholder="XX-XXXXXXX"
                            value={invoiceForm.taxId || ""}
                            onChange={e =>
                              setInvoiceForm(prev => ({
                                ...prev,
                                taxId: e.target.value,
                              }))
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
                            onChange={e =>
                              setInvoiceForm(prev => ({
                                ...prev,
                                email: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="phone">Phone</Label>
                          <Input
                            id="phone"
                            placeholder="+1 (555) 123-4567"
                            value={invoiceForm.phone || ""}
                            onChange={e =>
                              setInvoiceForm(prev => ({
                                ...prev,
                                phone: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="website">Website</Label>
                          <Input
                            id="website"
                            placeholder="https://company.com"
                            value={invoiceForm.website || ""}
                            onChange={e =>
                              setInvoiceForm(prev => ({
                                ...prev,
                                website: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      {/* Logo URL */}
                      <div className="border-t pt-4">
                        <Label htmlFor="logoUrl">Logo URL</Label>
                        <Input
                          id="logoUrl"
                          placeholder="https://company.com/logo.png"
                          value={invoiceForm.logoUrl || ""}
                          onChange={e =>
                            setInvoiceForm(prev => ({
                              ...prev,
                              logoUrl: e.target.value,
                            }))
                          }
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          URL to your company logo (recommended: 200x50px PNG)
                        </p>
                      </div>

                      {/* Footer & Terms */}
                      <div className="grid grid-cols-1 gap-4 border-t pt-4">
                        <div>
                          <Label htmlFor="footerText">Invoice Footer</Label>
                          <Textarea
                            id="footerText"
                            placeholder="Thank you for your business!"
                            value={invoiceForm.footerText || ""}
                            onChange={e =>
                              setInvoiceForm(prev => ({
                                ...prev,
                                footerText: e.target.value,
                              }))
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
                            onChange={e =>
                              setInvoiceForm(prev => ({
                                ...prev,
                                termsText: e.target.value,
                              }))
                            }
                            rows={3}
                          />
                        </div>
                      </div>

                      {/* Bank Details */}
                      <div className="border-t pt-4">
                        <h3 className="mb-3 text-sm font-medium">
                          Bank Details (for wire transfers)
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="bankName">Bank Name</Label>
                            <Input
                              id="bankName"
                              placeholder="First National Bank"
                              value={invoiceForm.bankDetails?.bankName || ""}
                              onChange={e =>
                                setInvoiceForm(prev => ({
                                  ...prev,
                                  bankDetails: {
                                    ...prev.bankDetails,
                                    bankName: e.target.value,
                                  },
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
                              onChange={e =>
                                setInvoiceForm(prev => ({
                                  ...prev,
                                  bankDetails: {
                                    ...prev.bankDetails,
                                    accountName: e.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor="accountNumber">
                              Account Number
                            </Label>
                            <Input
                              id="accountNumber"
                              placeholder="XXXXXXXXXX"
                              value={
                                invoiceForm.bankDetails?.accountNumber || ""
                              }
                              onChange={e =>
                                setInvoiceForm(prev => ({
                                  ...prev,
                                  bankDetails: {
                                    ...prev.bankDetails,
                                    accountNumber: e.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label htmlFor="routingNumber">
                              Routing Number
                            </Label>
                            <Input
                              id="routingNumber"
                              placeholder="XXXXXXXXX"
                              value={
                                invoiceForm.bankDetails?.routingNumber || ""
                              }
                              onChange={e =>
                                setInvoiceForm(prev => ({
                                  ...prev,
                                  bankDetails: {
                                    ...prev.bankDetails,
                                    routingNumber: e.target.value,
                                  },
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
                              onChange={e =>
                                setInvoiceForm(prev => ({
                                  ...prev,
                                  bankDetails: {
                                    ...prev.bankDetails,
                                    swiftCode: e.target.value,
                                  },
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
                              onChange={e =>
                                setInvoiceForm(prev => ({
                                  ...prev,
                                  bankDetails: {
                                    ...prev.bankDetails,
                                    iban: e.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>

                      {/* Custom Fields */}
                      <div className="border-t pt-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-sm font-medium">Custom Fields</h3>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={addCustomField}
                          >
                            <Plus className="mr-1 w-4 h-4" /> Add Field
                          </Button>
                        </div>
                        {invoiceForm.customFields?.map((field, index) => (
                          <div key={index} className="mb-2 flex gap-2">
                            <Input
                              placeholder="Label"
                              value={field.label}
                              onChange={e =>
                                updateCustomField(
                                  index,
                                  "label",
                                  e.target.value
                                )
                              }
                              className="flex-1"
                            />
                            <Input
                              placeholder="Value"
                              value={field.value}
                              onChange={e =>
                                updateCustomField(
                                  index,
                                  "value",
                                  e.target.value
                                )
                              }
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

                      {/* Save */}
                      <div className="flex justify-end border-t pt-4">
                        <Button
                          onClick={handleSaveInvoice}
                          disabled={
                            upsertInvoiceMutation.isPending || !tenant?.id
                          }
                          className="bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 hover:from-blue-700 hover:via-cyan-700 hover:to-teal-600"
                        >
                          {upsertInvoiceMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" /> Save Invoice
                              Settings
                            </>
                          )}
                        </Button>
                      </div>
                      {!tenant?.id && (
                        <p className="text-sm text-amber-600">
                          Your domain is not yet configured. Please contact
                          support.
                        </p>
                      )}
                    </div>
                  )}
                </DashboardCard>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
