"use client";
import { useState } from "react";
import Link from "next/link";

type Plan = {
  id: "outreach" | "growth" | "talent";
  name: string;
  description: string;
  price: number;
  period: string;
};

const plans: Plan[] = [
  {
    id: "outreach",
    name: "Outreach",
    description: "Campañas multicanal gestionadas",
    price: 1490,
    period: "mes",
  },
  {
    id: "growth",
    name: "Growth",
    description: "Stack completo: outreach + ads + CRO",
    price: 3490,
    period: "mes",
  },
  {
    id: "talent",
    name: "Talent",
    description: "Contratación full-time LATAM / Ghana",
    price: 1200,
    period: "mes",
  },
];

const PagosPage = () => {
  const [selectedPlan, setSelectedPlan] = useState<Plan>(plans[1]);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const basePrice = selectedPlan.price;
  const finalPrice =
    billing === "yearly" ? Math.round(basePrice * 12 * 0.85) : basePrice;
  const tax = Math.round(finalPrice * 0.21);
  const total = finalPrice + tax;

  const handleCheckout = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedPlan.id,
          billing,
          email,
          name,
          company,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "No se pudo iniciar el pago");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setLoading(false);
    }
  };

  return (
    <section className="relative min-h-screen overflow-hidden pt-28 pb-20 md:pt-32 lg:pt-36">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.2),transparent_70%)] blur-3xl" />
        <div className="absolute -right-40 bottom-0 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.2),transparent_70%)] blur-3xl" />
      </div>

      <div className="container">
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-10 text-center">
            <span className="mb-4 inline-block rounded-full border border-black/10 bg-white/60 px-4 py-1 text-xs font-medium text-black/70 backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:text-white/80">
              Checkout seguro · SSL
            </span>
            <h1 className="mb-3 text-3xl font-bold tracking-tight text-black sm:text-4xl md:text-5xl dark:text-white">
              Completa tu{" "}
              <span className="bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] bg-clip-text text-transparent">
                contratación
              </span>
            </h1>
            <p className="text-sm text-black/60 sm:text-base dark:text-white/60">
              Tu pago se procesa de forma segura. Cancelación flexible en cualquier momento.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
            {/* Left: form */}
            <div className="space-y-6 lg:col-span-3">
              {/* Plan select */}
              <div className="rounded-3xl border border-black/10 bg-white/80 p-6 backdrop-blur-xl sm:p-8 dark:border-white/10 dark:bg-[#0f1220]/80">
                <h2 className="mb-1 text-lg font-semibold text-black dark:text-white">
                  1. Elige tu plan
                </h2>
                <p className="mb-5 text-xs text-black/50 dark:text-white/50">
                  Puedes cambiar o cancelar cuando quieras.
                </p>

                <div className="mb-5 flex gap-2">
                  <button
                    onClick={() => setBilling("monthly")}
                    className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      billing === "monthly"
                        ? "bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] text-white"
                        : "border border-black/10 text-black/60 hover:border-black/30 dark:border-white/10 dark:text-white/60"
                    }`}
                  >
                    Mensual
                  </button>
                  <button
                    onClick={() => setBilling("yearly")}
                    className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      billing === "yearly"
                        ? "bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] text-white"
                        : "border border-black/10 text-black/60 hover:border-black/30 dark:border-white/10 dark:text-white/60"
                    }`}
                  >
                    Anual <span className="ml-1 text-xs opacity-80">-15%</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {plans.map((p) => {
                    const selected = selectedPlan.id === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPlan(p)}
                        className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition ${
                          selected
                            ? "border-[#a855f7] bg-[#a855f7]/5 ring-2 ring-[#a855f7]/20"
                            : "border-black/10 hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                              selected
                                ? "border-[#a855f7] bg-[#a855f7]"
                                : "border-black/30 dark:border-white/30"
                            }`}
                          >
                            {selected && (
                              <span className="h-2 w-2 rounded-full bg-white" />
                            )}
                          </span>
                          <div>
                            <div className="text-sm font-semibold text-black dark:text-white">
                              {p.name}
                            </div>
                            <div className="text-xs text-black/50 dark:text-white/50">
                              {p.description}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-black dark:text-white">
                            ${p.price.toLocaleString()}
                          </div>
                          <div className="text-xs text-black/50 dark:text-white/50">
                            /{p.period}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Billing info */}
              <div className="rounded-3xl border border-black/10 bg-white/80 p-6 backdrop-blur-xl sm:p-8 dark:border-white/10 dark:bg-[#0f1220]/80">
                <h2 className="mb-5 text-lg font-semibold text-black dark:text-white">
                  2. Información de facturación
                </h2>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60">
                      Nombre
                    </label>
                    <input
                      type="text"
                      placeholder="Tu nombre"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60">
                      Empresa
                    </label>
                    <input
                      type="text"
                      placeholder="Empresa"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60">
                      Email
                    </label>
                    <input
                      type="email"
                      placeholder="facturacion@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60">
                      País
                    </label>
                    <select className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white">
                      <option>México</option>
                      <option>Colombia</option>
                      <option>Argentina</option>
                      <option>Chile</option>
                      <option>Perú</option>
                      <option>España</option>
                      <option>Estados Unidos</option>
                      <option>Ghana</option>
                      <option>Otro</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Payment method — handled by Stripe Checkout (hosted) */}
              <div className="rounded-3xl border border-black/10 bg-white/80 p-6 backdrop-blur-xl sm:p-8 dark:border-white/10 dark:bg-[#0f1220]/80">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-black dark:text-white">
                    3. Método de pago
                  </h2>
                  <div className="flex gap-2">
                    <span className="rounded-md bg-black/5 px-2 py-1 text-xs font-bold text-black/60 dark:bg-white/10 dark:text-white/60">
                      VISA
                    </span>
                    <span className="rounded-md bg-black/5 px-2 py-1 text-xs font-bold text-black/60 dark:bg-white/10 dark:text-white/60">
                      MC
                    </span>
                    <span className="rounded-md bg-black/5 px-2 py-1 text-xs font-bold text-black/60 dark:bg-white/10 dark:text-white/60">
                      AMEX
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl bg-black/5 p-4 dark:bg-white/5">
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-[#a855f7]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <p className="text-xs text-black/70 dark:text-white/70">
                    Al pulsar <strong>Pagar</strong> serás redirigido al
                    checkout seguro de Stripe. Nunca almacenamos tu tarjeta —
                    toda la información de pago se procesa directamente con
                    Stripe (PCI-DSS nivel 1, 3D Secure).
                  </p>
                </div>
              </div>
            </div>

            {/* Right: summary */}
            <div className="lg:col-span-2">
              <div className="sticky top-24 rounded-3xl border border-black/10 bg-white/80 p-6 backdrop-blur-xl sm:p-8 dark:border-white/10 dark:bg-[#0f1220]/80">
                <h2 className="mb-5 text-lg font-semibold text-black dark:text-white">
                  Resumen
                </h2>

                <div className="mb-5 rounded-2xl bg-[linear-gradient(135deg,rgba(99,102,241,0.08),rgba(236,72,153,0.08))] p-4 dark:bg-[linear-gradient(135deg,rgba(99,102,241,0.15),rgba(236,72,153,0.15))]">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold text-black dark:text-white">
                        {selectedPlan.name}
                      </div>
                      <div className="text-xs text-black/60 dark:text-white/60">
                        {selectedPlan.description}
                      </div>
                    </div>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase text-black/70 dark:bg-white/10 dark:text-white/80">
                      {billing === "yearly" ? "Anual" : "Mensual"}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 border-t border-black/5 pt-5 text-sm dark:border-white/10">
                  <div className="flex justify-between text-black/70 dark:text-white/70">
                    <span>Subtotal</span>
                    <span>${finalPrice.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-black/70 dark:text-white/70">
                    <span>Impuestos (21%)</span>
                    <span>${tax.toLocaleString()}</span>
                  </div>
                  {billing === "yearly" && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>Descuento anual</span>
                      <span>-15%</span>
                    </div>
                  )}
                </div>

                <div className="my-5 border-t border-black/5 pt-5 dark:border-white/10">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-black dark:text-white">
                      Total
                    </span>
                    <span className="text-2xl font-bold text-black dark:text-white">
                      ${total.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-right text-xs text-black/50 dark:text-white/50">
                    {billing === "yearly" ? "Cobrado anualmente" : "Cobrado mensualmente"}
                  </div>
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={loading}
                  className="group flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] px-6 py-4 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(168,85,247,0.6)] transition hover:shadow-[0_15px_40px_-10px_rgba(168,85,247,0.8)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Redirigiendo…
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      Pagar ${total.toLocaleString()}
                    </>
                  )}
                </button>

                {error && (
                  <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500 dark:text-red-400">
                    {error}
                  </p>
                )}

                <div className="mt-5 space-y-2 text-xs text-black/50 dark:text-white/50">
                  <div className="flex items-center gap-2">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Pago seguro SSL · 3D Secure
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Cancelación en cualquier momento
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Soporte dedicado 24/7
                  </div>
                </div>

                <p className="mt-5 text-center text-xs text-black/50 dark:text-white/50">
                  ¿Ya eres cliente?{" "}
                  <Link href="/signin" className="font-semibold text-[#a855f7] hover:underline">
                    Iniciar sesión
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PagosPage;
