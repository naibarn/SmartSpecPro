/**
 * Contact Page - SmartAIHub
 * Contact form with support options
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { PublicContactTurnstile } from "@/components/PublicContactTurnstile";
import { Seo } from "@/components/Seo";
import { trpc } from "@/lib/trpc";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import {
  Mail,
  MessageSquare,
  MapPin,
  Send,
  Clock,
  CheckCircle,
  HelpCircle,
  Bug,
  Lightbulb,
  Building2,
  QrCode,
} from "lucide-react";

type ContactType = "general" | "support" | "sales" | "bug" | "feature";

interface ContactTypeOption {
  id: ContactType;
  labelKey: string;
  icon: React.ReactNode;
  descriptionKey: string;
}

const contactTypes: ContactTypeOption[] = [
  {
    id: "general",
    labelKey: "contact.type.general.label",
    icon: <MessageSquare className="w-5 h-5" />,
    descriptionKey: "contact.type.general.description",
  },
  {
    id: "support",
    labelKey: "contact.type.support.label",
    icon: <HelpCircle className="w-5 h-5" />,
    descriptionKey: "contact.type.support.description",
  },
  {
    id: "sales",
    labelKey: "contact.type.sales.label",
    icon: <Building2 className="w-5 h-5" />,
    descriptionKey: "contact.type.sales.description",
  },
  {
    id: "bug",
    labelKey: "contact.type.bug.label",
    icon: <Bug className="w-5 h-5" />,
    descriptionKey: "contact.type.bug.description",
  },
  {
    id: "feature",
    labelKey: "contact.type.feature.label",
    icon: <Lightbulb className="w-5 h-5" />,
    descriptionKey: "contact.type.feature.description",
  },
];

const contactInfo = [
  {
    icon: <Mail className="w-6 h-6" />,
    titleKey: "contact.info.email.title",
    valueKey: "contact.info.email.value",
    link: "mailto:smartaihubapp@gmail.com",
    image: null,
  },
  {
    icon: <QrCode className="w-6 h-6" />,
    titleKey: "contact.info.line.title",
    valueKey: "contact.info.line.value",
    link: "https://line.me/ti/p/SbZEQeRa6W",
    image: "/images/smartaihub-line-qr.png",
  },
  {
    icon: <MapPin className="w-6 h-6" />,
    titleKey: "contact.info.address.title",
    valueKey: "contact.info.address.value",
    link: null,
    image: null,
  },
  {
    icon: <Clock className="w-6 h-6" />,
    titleKey: "contact.info.response.title",
    valueKey: "contact.info.response.value",
    link: null,
    image: null,
  },
];

export default function Contact() {
  const { t } = useScopedTranslation("publicSite");
  const protectionConfigQuery = trpc.feedback.publicContactConfig.useQuery();
  const submitPublicContact = trpc.feedback.submitPublicContact.useMutation();
  const [selectedType, setSelectedType] = useState<ContactType>("general");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [formStartedAt, setFormStartedAt] = useState(() => Date.now());
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    subject: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      protectionConfigQuery.data?.turnstileRequired &&
      (!protectionConfigQuery.data.turnstileConfigured || !turnstileToken)
    ) {
      toast.error(t("contact.security.complete"));
      return;
    }
    setIsSubmitting(true);
    try {
      await submitPublicContact.mutateAsync({
        contactType: selectedType,
        name: formData.name,
        email: formData.email,
        company: formData.company || undefined,
        subject: formData.subject,
        message: formData.message,
        turnstileToken: turnstileToken || undefined,
        honeypot,
        formStartedAt,
      });
      setIsSubmitted(true);
      toast.success(t("contact.toast.success"));
      setTimeout(() => {
        setIsSubmitted(false);
        setFormData({
          name: "",
          email: "",
          company: "",
          subject: "",
          message: "",
        });
        setTurnstileToken("");
        setHoneypot("");
        setFormStartedAt(Date.now());
      }, 3000);
    } catch {
      toast.error(t("contact.toast.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-cyan-50/20">
      <Seo
        title={t("contact.meta.title")}
        description={t("contact.meta.description")}
        keywords={[
          "contact SmartAIHub",
          "enterprise support",
          "sales",
          "feature request",
          "technical support",
        ]}
        canonicalPath="/contact"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          name: t("contact.meta.name"),
          description: t("contact.meta.description"),
          url: "/contact",
        }}
      />
      <Navbar />

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4">
        <div className="container max-w-6xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-blue-100 text-sm text-blue-600 mb-6">
              <MessageSquare className="w-4 h-4" />
              {t("contact.hero.eyebrow")}
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
              {t("contact.hero.title")}{" "}
              <span className="bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-400 bg-clip-text text-transparent">
                {t("contact.hero.titleAccent")}
              </span>
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {t("contact.hero.body")}
            </p>
          </motion.div>
        </div>
      </section>

      {/* Contact Info Cards */}
      <section className="py-8 px-4">
        <div className="container max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {contactInfo.map((info, index) => (
              <motion.div
                key={info.titleKey}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                {info.link ? (
                  <a
                    href={info.link}
                    target={info.image ? "_blank" : undefined}
                    rel={info.image ? "noopener noreferrer" : undefined}
                    className="block p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg shadow-blue-500/5 hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300 group"
                  >
                    {info.image ? (
                      <img
                        src={info.image}
                        alt={t("contact.info.line.alt")}
                        className="mb-4 h-24 w-24 rounded-xl bg-white object-contain p-1 group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform">
                        {info.icon}
                      </div>
                    )}
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {t(info.titleKey)}
                    </h3>
                    <p className="text-gray-600 text-sm">{t(info.valueKey)}</p>
                  </a>
                ) : (
                  <div className="p-6 bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 shadow-lg shadow-blue-500/5">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white mb-4">
                      {info.icon}
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {t(info.titleKey)}
                    </h3>
                    <p className="text-gray-600 text-sm">{t(info.valueKey)}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form Section */}
      <section className="py-16 px-4">
        <div className="container max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Contact Type Selector */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="lg:col-span-1"
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                {t("contact.form.heading")}
              </h2>
              <div className="space-y-3">
                {contactTypes.map(type => (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={`w-full p-4 rounded-xl text-left transition-all duration-300 ${
                      selectedType === type.id
                        ? "bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-lg shadow-blue-500/30"
                        : "bg-white/60 backdrop-blur-sm border border-white/50 hover:border-blue-200 hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`${
                          selectedType === type.id
                            ? "text-white"
                            : "text-blue-500"
                        }`}
                      >
                        {type.icon}
                      </div>
                      <div>
                        <h3
                          className={`font-semibold ${
                            selectedType === type.id
                              ? "text-white"
                              : "text-gray-900"
                          }`}
                        >
                          {t(type.labelKey)}
                        </h3>
                        <p
                          className={`text-sm ${
                            selectedType === type.id
                              ? "text-white/80"
                              : "text-gray-500"
                          }`}
                        >
                          {t(type.descriptionKey)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="lg:col-span-2"
            >
              <div className="bg-white/70 backdrop-blur-xl rounded-3xl border border-white/50 shadow-xl shadow-blue-500/10 p-8">
                {isSubmitted ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-16"
                  >
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mx-auto mb-6">
                      <CheckCircle className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      {t("contact.success.title")}
                    </h3>
                    <p className="text-gray-600">{t("contact.success.body")}</p>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t("contact.form.name")} *
                        </label>
                        <Input
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          placeholder={t("contact.form.namePlaceholder")}
                          required
                          className="bg-white/50 border-gray-200 focus:border-blue-400 focus:ring-blue-400"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t("contact.form.email")} *
                        </label>
                        <Input
                          name="email"
                          type="email"
                          value={formData.email}
                          onChange={handleChange}
                          placeholder={t("contact.form.emailPlaceholder")}
                          required
                          className="bg-white/50 border-gray-200 focus:border-blue-400 focus:ring-blue-400"
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t("contact.form.company")}
                        </label>
                        <Input
                          name="company"
                          value={formData.company}
                          onChange={handleChange}
                          placeholder={t("contact.form.companyPlaceholder")}
                          className="bg-white/50 border-gray-200 focus:border-blue-400 focus:ring-blue-400"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {t("contact.form.subject")} *
                        </label>
                        <Input
                          name="subject"
                          value={formData.subject}
                          onChange={handleChange}
                          placeholder={t("contact.form.subjectPlaceholder")}
                          required
                          className="bg-white/50 border-gray-200 focus:border-blue-400 focus:ring-blue-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t("contact.form.message")} *
                      </label>
                      <Textarea
                        name="message"
                        value={formData.message}
                        onChange={handleChange}
                        placeholder={t("contact.form.messagePlaceholder")}
                        rows={6}
                        required
                        className="bg-white/50 border-gray-200 focus:border-blue-400 focus:ring-blue-400 resize-none"
                      />
                    </div>

                    <input
                      type="text"
                      name="website"
                      value={honeypot}
                      onChange={event => setHoneypot(event.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                      aria-hidden="true"
                      className="absolute -left-[9999px] h-px w-px opacity-0"
                    />

                    {protectionConfigQuery.data?.turnstileRequired ? (
                      protectionConfigQuery.data.turnstileConfigured &&
                      protectionConfigQuery.data.turnstileSiteKey ? (
                        <PublicContactTurnstile
                          siteKey={protectionConfigQuery.data.turnstileSiteKey}
                          onToken={setTurnstileToken}
                          errorMessage={t("contact.security.unavailable")}
                        />
                      ) : (
                        <p className="text-sm text-red-600">
                          {t("contact.security.unavailable")}
                        </p>
                      )
                    ) : null}

                    <div className="flex items-center justify-between pt-4">
                      <p className="text-sm text-gray-500">
                        {t("contact.form.required")}
                      </p>
                      <Button
                        type="submit"
                        disabled={
                          isSubmitting ||
                          (Boolean(
                            protectionConfigQuery.data?.turnstileRequired
                          ) &&
                            (!protectionConfigQuery.data?.turnstileConfigured ||
                              !turnstileToken))
                        }
                        className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white px-8 py-3 rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all duration-300"
                      >
                        {isSubmitting ? (
                          <>
                            <span className="animate-spin mr-2">⏳</span>
                            {t("contact.form.sending")}
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            {t("contact.form.send")}
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 px-4">
        <div className="container max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              {t("contact.faq.title")}
            </h2>
            <p className="text-gray-600">{t("contact.faq.body")}</p>
          </motion.div>

          <div className="space-y-4">
            {[
              {
                q: t("contact.faq.response.question"),
                a: t("contact.faq.response.answer"),
              },
              {
                q: t("contact.faq.line.question"),
                a: t("contact.faq.line.answer"),
              },
              {
                q: t("contact.faq.demo.question"),
                a: t("contact.faq.demo.answer"),
              },
              {
                q: t("contact.faq.docs.question"),
                a: t("contact.faq.docs.answer"),
              },
            ].map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 p-6"
              >
                <h3 className="font-semibold text-gray-900 mb-2">{faq.q}</h3>
                <p className="text-gray-600">{faq.a}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
