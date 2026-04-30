# QueryBay — pricing & cost analysis

**2026-04-30 · Working draft**

> Mercado actual: confusion entre dos modelos. La landing vende **agencia
> done-for-you** ($390-$1200/mo). El app vende **SaaS** ($49-$199/mo).
> Este documento ordena los benchmarks y recomienda un esquema unificado.

---

## 1. Costos reales — infra fija (Mes 0)

| Item | Costo/mes | Notas |
|---|---|---|
| Hetzner CPX21 VPS | ~$8 | 4 vCPU, 8 GB RAM. Soporta 30 LinkedIn integrations con asset blocking on. |
| Supabase Pro | $25 | 8 GB DB, 250 GB egress. Free plan rinde hasta los primeros 5-10 clientes. |
| Vercel Pro | $20 | Por seat. Solo 1 seat (Jean). |
| Domain (.com) | $1 | $12/año amortizado. |
| Resend (email) | $0-20 | Free hasta 100/día; Pro si activamos welcome + receipts. |
| Groq API | $0-15 | Llama 3.3 70B ~$0.59/M tokens. ~25M tokens/mo a 30 clientes. |
| **Total fijo** | **~$55-90** | Sin IPv6 / proxies / extras. |

## 2. Costos por unidad

| Recurso | Costo marginal | Comentario |
|---|---|---|
| 1 LinkedIn integration (headless) | ~$0 | Comparte VPS hasta 30 cuentas. |
| 1 LinkedIn integration (browse-mode) | ~$0 | Misma VPS. |
| 1 invitación enviada | ~$0.0001 | Solo Groq tokens si AI personalization. |
| 1 mensaje DM | ~$0.0005 | Idem. |
| 1 cliente nuevo (provisioning) | $50-150 | 1-3 hours de Jean a $50/h. |
| 1 cliente pagando (ops mensual) | $100-300 | 2-6 hours/mo de Jean a $50/h. |
| Stripe fee | 2.9% + $0.30 | Por transacción. |

## 3. Benchmarks — competencia directa

### LinkedIn automation SaaS (self-serve)
| Producto | Plan entry | Plan medio | Plan top |
|---|---|---|---|
| **Dripify** | $59/mo Basic | $79/mo Pro | $99/mo Advanced |
| **Linked Helper 2** | $15/mo per seat | $45/mo Pro | $99/mo team |
| **Smartlead** | $94/mo Basic | $174/mo Pro | $299/mo Custom |
| **HeyReach** | $89/mo per acc | $499/mo agency 10 | enterprise |
| **Waalaxy** | $0 free | $112/mo Pro | $228/mo Advanced |
| **Expandi** | $99/mo per seat | $79/mo Business 3+ | enterprise |
| **Lemlist** | $69/mo Standard | $129/mo Pro | $179/mo Multi-channel |
| **Smartlead** | $94/mo | $174/mo | $299/mo |
| **Mediana SaaS** | **~$70-90** | **~$130** | **~$200+** |

### Multichannel outreach managed (done-for-you)
| Agencia | Entry | Mid | Top |
|---|---|---|---|
| **Cleverly** | $397/mo Silver | $697/mo Gold | $897/mo Platinum |
| **Belkins** | $5,000/mo retainer | $8,000/mo | $12k+ enterprise |
| **Pearl Lemon Leads** | $2,000/mo | $3,500/mo | $5,000+/mo |
| **CIENCE** | $5k+ retainer | $10k | enterprise |
| **Mediana agencia** | **~$2-5k/mo** | **~$5-8k/mo** | **$10k+/mo** |

### Remote talent / staffing LATAM
| Servicio | Modelo | Pricing típico |
|---|---|---|
| **Deel** | Por contractor + commission | $49/mo per contractor + 5-10% on hire |
| **Remote.com** | Por employee + payroll | $599/mo per employee |
| **Lano** | Subscription per worker | $19-29/mo per contractor |
| **Andela** | Markup sobre talento | $40-90/hr depende de seniority |
| **NearDevs** | Markup sobre devs LATAM | $25-60/hr engineering |
| **Talent fee típica** | One-time placement | 15-25% del salario anual |

## 4. Diagnóstico: dónde están QueryBay y QueryBay-app hoy

### Landing (querybay.com)
- **Outreach** $390/mo — **menor que Cleverly** ($397). Posicionado como agencia entry, pero el precio es de la base más baja del mercado.
- **Growth** $650/mo — entre Cleverly Gold ($697) y Belkins ($2k+). En zona muerta.
- **Talent** $1,200/mo — **muy bajo** para staffing. Deel es $49/mo + commission, pero un servicio "managed full-time hire" con curation + on-going management debería ser $1,500-3,000/mo + placement fee.

### App (querybay-app)
- **Free / Pro $49 / Enterprise $199** — pricing SaaS estándar correcto.
- Pro $49 está alineado con Dripify Basic ($59) — competitivo.
- Enterprise $199 razonable contra HeyReach Agency ($499) — sub-precio pero defendible si limit de cuentas es menor.

## 5. Recomendaciones por modelo

### A) Modelo Agencia (lo que vende la landing hoy)

Subir precios alineando con Cleverly + ajustar por entrega:

| Plan | Precio recomendado | Incluye |
|---|---|---|
| **Outreach** | **$497/mo** ($390→$497) | LinkedIn + email; 1 cuenta gestionada; reportes mensuales; setup incluido |
| **Growth** | **$897/mo** ($650→$897) | + paid ads management + CRO + multi-channel; 2-3 cuentas; reuniones quincenales |
| **Scale** | **$1,997/mo** (nuevo) | Lo de Growth + 1 SDR LATAM dedicated 20h/sem; 5 cuentas; CRM integration |
| **Talent** | **separar producto** | One-time placement: 15% del salario anual + opcional $497/mo de management |

Margen esperado: 50-70% por cliente, asumiendo Jean cobra $50/h interno.

### B) Modelo SaaS self-serve (querybay-app)

Ajustar tiers actuales para mejor cobertura del mercado:

| Plan | Precio | Límites |
|---|---|---|
| **Free** | $0 | 1 LinkedIn, 50 actions/mo, sin AI chat |
| **Starter** | **$49/mo** | 1 LinkedIn, 1,000 actions/mo, AI chat básica |
| **Pro** | **$99/mo** | 3 LinkedIn, 5,000 actions/mo, multichannel inbox, asset blocking |
| **Business** | **$199/mo** | 10 LinkedIn, 20,000 actions/mo, dedicated proxy, priority support |
| **Agency** | **$399/mo** | 25 LinkedIn, unlimited actions, white-label, team seats |

Compatible con el enum `plan_tier` actual si renombramos:
- `free` → keep
- `pro` → "Starter" o "Pro" (decidir UI label)
- `enterprise` → "Business" o "Agency"

### C) Modelo híbrido (recomendado para Jean)

**SaaS self-serve abajo + Servicios "Done-for-you" arriba.** Captura ambos segmentos sin canibalizar:

```
Self-serve (operador opera él mismo):
├─ Free          $0/mo     → conversión + lead magnet
├─ Pro           $99/mo    → 3 cuentas, casi todos los features
└─ Agency        $399/mo   → multi-cuenta, white-label

Done-for-you (Jean opera la cuenta):
├─ Outreach      $497/mo   → 1 cuenta, agencia entry
├─ Growth        $1,497/mo → multi-channel + paid ads
└─ Scale         $2,997/mo → SDR dedicated + CRM integration

Add-on:
└─ Talent        15% salary annual one-time + $497/mo retainer
```

Justificación:
- Self-serve genera revenue mientras hay tiempo cero para entrega.
- Done-for-you absorbe los clientes que no quieren operar la herramienta.
- Talent es producto separado (recruiting fee model).

## 6. Camino recomendado

1. **Decidir modelo** (A/B/C) — esto define todo lo siguiente.
2. **Si C (híbrido)**: separar la página de Pricing en la landing en dos secciones — "Self-serve" (links a `app.querybay.com/billing`) y "Done-for-you" (links a `/checkout`).
3. **Reescribir copy de Hero** acorde — hoy mezcla agencia + SaaS sin distinguir.
4. **Stripe Price IDs reales** — los `price_REPLACE_*` env vars no fallan al import gracias al lazy-init, pero romperán al primer checkout.
5. **Customer Portal de Stripe** — habilitar en el Stripe dashboard. Gratis. Reemplaza ~80% del UI de billing self-serve (cancel, change plan, update card, download invoices).
6. **Testimonials reales** — revisar `Testimonials/index.tsx`. Si son ficticios, removerlos (más seguro legal y mejor para conversión).

## 7. Punto de equilibrio

A precios recomendados modelo C:

| Clientes | MRR estimado | Costo Jean | Margen |
|---|---|---|---|
| 5 SaaS Pro | $495 | $0-100 | $400+ |
| 10 SaaS Pro | $990 | $50-150 | $850+ |
| 1 Agency Outreach | $497 | $150-300 | $200-350 |
| 3 Agency Growth | $4,491 | $600-1,500 | $3,000+ |
| **Mix realista (mes 6)** | **~$2,500-4,000** | **$300-800** | **$2,000-3,200** |

Punto de break-even sobre infra fija ($90/mo): **1 cliente Pro o 1 cliente Outreach**.
Salario operativo de Jean cubierto ($3-5k/mo): **5-8 clientes mix**.

## 8. Riesgos

- **LinkedIn TOS** — automation está en zona gris. Cuentas de testing pueden ser baneadas. Comunicación clara con clientes (warmup, límites diarios) es esencial.
- **Asset blocking** — si LinkedIn detecta el flag y banea cuentas, perdemos clientes. Validar canary primero (ver ADR-022 en querybay-app).
- **Concentración** — si 1 cliente representa >40% de MRR, churn duele mucho. Diversificar.
- **Talent line** — recruiting requiere expertise/red distinta. Si Jean no tiene candidates pipeline en LATAM/Ghana, prometer este servicio sin entregarlo daña la marca paraguas.

---

**Próximo paso accionable:** Jean elige modelo (A/B/C). Después yo:
- Actualizo `Pricing/index.tsx` con los nuevos planes
- Genero env vars Stripe (lista con `STRIPE_PRICE_*` exactas)
- Actualizo `landingPlanToAppTier()` en webhook si cambian los plan IDs
- Reescribo Hero/About copy si separamos secciones
