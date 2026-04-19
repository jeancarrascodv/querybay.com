import { ReactNode } from "react";

export type LegalSection = {
  heading: string;
  body: ReactNode;
};

export type LegalContent = {
  pageName: string;
  description: string;
  lastUpdated: string;
  intro: ReactNode;
  sections: LegalSection[];
};

export const termsContent: LegalContent = {
  pageName: "Terms of Service",
  description:
    "The agreement between you and QueryBay when you use our services, subscribe to a plan, or hire talent through the platform.",
  lastUpdated: "April 18, 2026",
  intro: (
    <>
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and
        use of the websites, applications, and services (collectively, the
        &ldquo;Services&rdquo;) operated by QueryBay (&ldquo;QueryBay&rdquo;,
        &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;). By accessing
        or using the Services, or by clicking to accept these Terms, you agree
        to be bound by them. If you are entering into these Terms on behalf of
        a company or other legal entity, you represent that you have the
        authority to bind that entity, in which case &ldquo;you&rdquo; or
        &ldquo;Customer&rdquo; refers to that entity.
      </p>
      <p>If you do not agree to these Terms, do not use the Services.</p>
    </>
  ),
  sections: [
    {
      heading: "The Services",
      body: (
        <>
          <p>
            QueryBay provides growth marketing, multichannel outreach
            (including LinkedIn, email, WhatsApp, and voice), and remote talent
            sourcing and outsourcing services across Latin America and Ghana.
            Specific scope, deliverables, and performance expectations are
            described in your subscription plan, an order form, or a separate
            statement of work.
          </p>
          <p>
            We may update, modify, or discontinue features from time to time.
            We will not make changes that materially reduce the core
            functionality of a paid plan during an active billing period
            without reasonable notice.
          </p>
        </>
      ),
    },
    {
      heading: "Eligibility & Accounts",
      body: (
        <p>
          To use the Services you must be at least 18 years old and capable of
          forming a binding contract. You are responsible for maintaining the
          confidentiality of your account credentials and for all activity
          that occurs under your account. Notify us promptly at
          support@querybay.com if you suspect unauthorized access.
        </p>
      ),
    },
    {
      heading: "Subscriptions, Billing & Refunds",
      body: (
        <>
          <p>
            Paid plans are billed in advance on a monthly or annual basis
            through our payment processor, Stripe. By subscribing you
            authorize us (and Stripe) to charge your payment method on a
            recurring basis until you cancel. Prices are stated in U.S.
            dollars and exclude applicable taxes, which are your
            responsibility unless stated otherwise.
          </p>
          <p>
            Subscriptions renew automatically for the same term unless
            canceled before the renewal date. You may cancel at any time
            through your account or by emailing billing@querybay.com.
            Cancellation takes effect at the end of the current billing
            period; you will retain access until that date.
          </p>
          <p>
            Except where required by law, fees are non-refundable. If you
            believe you were billed in error, contact us within 30 days of
            the charge and we will review the matter in good faith.
          </p>
          <p>
            We may change pricing with at least 30 days&apos; notice. Price
            changes will take effect in the billing period following the
            notice.
          </p>
        </>
      ),
    },
    {
      heading: "Remote Talent & Staffing",
      body: (
        <>
          <p>
            Where QueryBay sources, vets, or places remote professionals on
            your behalf, the placed individuals may be engaged as QueryBay
            contractors, QueryBay employees, or, where applicable, engaged
            directly by you under a separate agreement. The specific
            structure, payroll responsibility, and replacement policy for
            each engagement are described in the applicable order form or
            plan page.
          </p>
          <p>
            You agree to treat placed professionals with professionalism and
            in accordance with applicable anti-discrimination, workplace
            safety, and labor laws. Misconduct, harassment, or unlawful
            directions toward placed professionals may result in immediate
            suspension or termination of the Services.
          </p>
        </>
      ),
    },
    {
      heading: "Acceptable Use",
      body: (
        <>
          <p>You agree not to, and not to enable others to:</p>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              Use the Services to send spam, unsolicited bulk messages, or
              communications that violate the CAN-SPAM Act, GDPR, LinkedIn
              User Agreement, WhatsApp Business Terms, or similar laws and
              platform rules;
            </li>
            <li>
              Upload or provide data for outreach that you do not have a
              lawful basis to process, or that was obtained through scraping
              in violation of a platform&apos;s terms;
            </li>
            <li>
              Use the Services for activities that are discriminatory,
              deceptive, defamatory, or fraudulent, or that promote illegal
              goods or services;
            </li>
            <li>
              Reverse-engineer, resell, sublicense, or white-label the
              Services without our express written consent;
            </li>
            <li>
              Interfere with, disrupt, or attempt to gain unauthorized access
              to our systems or the accounts of other customers.
            </li>
          </ul>
        </>
      ),
    },
    {
      heading: "Customer Data & Your Responsibilities",
      body: (
        <>
          <p>
            You retain ownership of all data, content, and lists you provide
            to us (&ldquo;Customer Data&rdquo;). You grant QueryBay a limited,
            worldwide, non-exclusive license to host, process, and transmit
            Customer Data solely to provide, improve, and support the
            Services.
          </p>
          <p>
            You represent and warrant that you have all rights, consents, and
            lawful bases required to provide Customer Data to us and to
            instruct us to contact the individuals it describes. Where
            required by law (for example, under GDPR or similar frameworks),
            we will enter into a data processing agreement with you upon
            request.
          </p>
        </>
      ),
    },
    {
      heading: "Third-Party Services",
      body: (
        <p>
          The Services integrate with or rely on third parties including
          Stripe (payments), LinkedIn, email providers, WhatsApp, voice and
          telephony providers, and analytics tools. We are not responsible
          for the availability, policies, or acts of those third parties,
          and their terms and privacy policies apply to your use of their
          services. Changes they make to their platforms (for example, rate
          limits or API changes) may affect features of the Services.
        </p>
      ),
    },
    {
      heading: "Intellectual Property",
      body: (
        <>
          <p>
            QueryBay and its licensors own all right, title, and interest in
            and to the Services, including all software, models, workflows,
            templates, playbooks, and documentation, and all associated
            intellectual property rights. No rights are granted to you other
            than as expressly set forth in these Terms.
          </p>
          <p>
            Feedback you provide about the Services is not confidential, and
            you grant us an unrestricted, royalty-free license to use and
            incorporate it.
          </p>
        </>
      ),
    },
    {
      heading: "Confidentiality",
      body: (
        <p>
          Each party may receive non-public information from the other that
          is confidential or proprietary (&ldquo;Confidential
          Information&rdquo;). The receiving party will use the same degree
          of care it uses to protect its own confidential information (and
          in no event less than reasonable care) and will use Confidential
          Information only to perform its obligations or exercise its rights
          under these Terms.
        </p>
      ),
    },
    {
      heading: "Disclaimers",
      body: (
        <p>
          THE SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
          AVAILABLE&rdquo;. TO THE MAXIMUM EXTENT PERMITTED BY LAW, QUERYBAY
          DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT,
          AND ANY WARRANTIES ARISING FROM A COURSE OF DEALING OR USAGE OF
          TRADE. WE DO NOT WARRANT SPECIFIC LEAD, CONVERSION, REVENUE, OR
          HIRING OUTCOMES, AND RESULTS MAY VARY BY INDUSTRY, OFFER, AND
          MARKET CONDITIONS.
        </p>
      ),
    },
    {
      heading: "Limitation of Liability",
      body: (
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE
          LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
          PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUES, DATA, OR
          GOODWILL, ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICES.
          OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR
          RELATED TO THESE TERMS WILL NOT EXCEED THE AMOUNTS PAID OR PAYABLE
          BY YOU TO QUERYBAY IN THE TWELVE (12) MONTHS PRECEDING THE EVENT
          GIVING RISE TO THE CLAIM.
        </p>
      ),
    },
    {
      heading: "Indemnification",
      body: (
        <p>
          You will defend, indemnify, and hold harmless QueryBay, its
          affiliates, and their respective officers, directors, employees,
          and agents from and against any third-party claims, damages,
          liabilities, and expenses (including reasonable attorneys&apos;
          fees) arising out of or related to (a) your use of the Services in
          violation of these Terms or applicable law, (b) Customer Data, or
          (c) your interactions with placed professionals or end recipients
          of outreach.
        </p>
      ),
    },
    {
      heading: "Termination",
      body: (
        <p>
          You may cancel your subscription at any time as described above. We
          may suspend or terminate the Services immediately if you materially
          breach these Terms, fail to pay amounts due, or engage in conduct
          that exposes QueryBay or other customers to legal, reputational, or
          security risk. Sections that by their nature should survive
          termination will survive, including sections on Intellectual
          Property, Confidentiality, Disclaimers, Limitation of Liability,
          and Indemnification.
        </p>
      ),
    },
    {
      heading: "Governing Law & Disputes",
      body: (
        <p>
          These Terms are governed by the laws of the State of Delaware,
          United States, without regard to its conflict of law principles.
          The parties consent to the exclusive jurisdiction of the state and
          federal courts located in Delaware for any dispute arising out of
          or related to these Terms, except that either party may seek
          injunctive relief in any competent jurisdiction to protect its
          intellectual property or Confidential Information.
        </p>
      ),
    },
    {
      heading: "Changes to These Terms",
      body: (
        <p>
          We may update these Terms from time to time. If we make material
          changes we will provide notice through the Services or by email.
          Changes take effect on the date stated in the updated Terms. Your
          continued use of the Services after the effective date constitutes
          acceptance of the updated Terms.
        </p>
      ),
    },
    {
      heading: "Contact",
      body: (
        <p>
          Questions about these Terms? Email{" "}
          <a
            href="mailto:legal@querybay.com"
            className="font-medium text-[#a855f7] hover:underline"
          >
            legal@querybay.com
          </a>
          .
        </p>
      ),
    },
  ],
};

export const privacyContent: LegalContent = {
  pageName: "Privacy Policy",
  description:
    "What we collect, why we collect it, and the choices you have over your personal information.",
  lastUpdated: "April 18, 2026",
  intro: (
    <>
      <p>
        This Privacy Policy explains how QueryBay (&ldquo;QueryBay&rdquo;,
        &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) collects,
        uses, shares, and protects personal information when you visit our
        website, use our services, or otherwise interact with us. It applies
        to prospective customers, customers, their end recipients of outreach
        campaigns we operate, and candidates who apply to remote talent
        opportunities.
      </p>
      <p>If you disagree with this Policy, please do not use the Services.</p>
    </>
  ),
  sections: [
    {
      heading: "Information We Collect",
      body: (
        <>
          <p>
            <strong>Information you give us.</strong> When you sign up,
            subscribe, or contact us, we collect your name, business email,
            company, role, billing address, phone number, and any information
            you submit through forms, calls, or chats.
          </p>
          <p>
            <strong>Customer Data.</strong> If you use QueryBay to run
            outreach campaigns or to hire remote talent, you may share
            contact lists, CRM data, candidate profiles, campaign content,
            and performance data. You remain the controller of this data;
            we process it on your behalf as your service provider.
          </p>
          <p>
            <strong>Usage & device data.</strong> We automatically collect
            information about your interaction with the Services such as IP
            address, browser type, operating system, referring URLs, pages
            viewed, and timestamps.
          </p>
          <p>
            <strong>Payment data.</strong> Payments are processed by Stripe.
            We do not store full card numbers. Stripe provides us with a
            token, the last four digits, the card brand, and billing
            metadata.
          </p>
          <p>
            <strong>Cookies & similar technologies.</strong> We use
            first-party and third-party cookies to operate the site,
            remember preferences, measure performance, and (with consent
            where required) run analytics.
          </p>
        </>
      ),
    },
    {
      heading: "How We Use Information",
      body: (
        <>
          <p>We use personal information to:</p>
          <ul className="ml-5 list-disc space-y-2">
            <li>Provide, operate, and improve the Services;</li>
            <li>
              Process payments, manage subscriptions, and send transactional
              communications (receipts, onboarding, product updates);
            </li>
            <li>
              Run outreach campaigns you configure, staff placements, and
              deliver results reporting;
            </li>
            <li>Provide customer support and respond to requests;</li>
            <li>
              Monitor security, prevent fraud, and enforce our Terms of
              Service;
            </li>
            <li>
              Send marketing communications where you have opted in, and
              measure their effectiveness;
            </li>
            <li>
              Comply with legal obligations and respond to lawful requests.
            </li>
          </ul>
        </>
      ),
    },
    {
      heading: "Legal Bases for Processing (EEA / UK)",
      body: (
        <p>
          If you are in the European Economic Area or United Kingdom, we rely
          on one or more of the following legal bases: performance of a
          contract with you; our legitimate interests in running, improving,
          and securing the Services; compliance with a legal obligation; and,
          where required, your consent (which you may withdraw at any time).
        </p>
      ),
    },
    {
      heading: "How We Share Information",
      body: (
        <>
          <p>We do not sell personal information. We share it with:</p>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong>Service providers</strong> acting as our processors,
              including cloud hosting, email and messaging infrastructure,
              analytics, customer support, and Stripe for payments;
            </li>
            <li>
              <strong>Professional advisors</strong> such as auditors and
              lawyers, where necessary;
            </li>
            <li>
              <strong>Authorities</strong> when required by law, subpoena, or
              to protect the rights, property, or safety of QueryBay or
              others;
            </li>
            <li>
              <strong>Corporate transactions</strong>, in connection with a
              merger, acquisition, financing, or sale of assets, subject to
              customary confidentiality obligations.
            </li>
          </ul>
          <p>
            When we act as a processor on behalf of a customer, we share
            information only as instructed by that customer and in accordance
            with our data processing agreement.
          </p>
        </>
      ),
    },
    {
      heading: "International Transfers",
      body: (
        <p>
          QueryBay operates across Latin America, Ghana, and the United
          States, and our service providers operate globally. Personal
          information may be transferred to and processed in countries other
          than the one in which you are located. Where required, we implement
          appropriate safeguards such as Standard Contractual Clauses or
          equivalent mechanisms.
        </p>
      ),
    },
    {
      heading: "Data Retention",
      body: (
        <p>
          We retain personal information for as long as necessary to provide
          the Services, comply with legal obligations (such as tax,
          accounting, and anti-fraud requirements), resolve disputes, and
          enforce our agreements. When we no longer need information we
          delete or anonymize it.
        </p>
      ),
    },
    {
      heading: "Your Rights",
      body: (
        <>
          <p>
            Depending on where you live, you may have the right to: access a
            copy of your personal information; correct inaccurate information;
            delete information; restrict or object to certain processing;
            port your information to another service; opt out of targeted
            advertising or the &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; of
            personal information (as those terms are defined under applicable
            law); and withdraw consent.
          </p>
          <p>
            To exercise any of these rights, email{" "}
            <a
              href="mailto:privacy@querybay.com"
              className="font-medium text-[#a855f7] hover:underline"
            >
              privacy@querybay.com
            </a>
            . We will respond within the timeframes required by applicable
            law. You also have the right to lodge a complaint with your
            local data protection authority.
          </p>
          <p>
            If you are the end recipient of outreach run on behalf of one of
            our customers, your request will generally be forwarded to that
            customer, who is the controller of the list that was used to
            contact you.
          </p>
        </>
      ),
    },
    {
      heading: "Security",
      body: (
        <p>
          We use administrative, technical, and physical safeguards designed
          to protect personal information, including encryption in transit,
          access controls, and monitoring. No system is perfectly secure; if
          we become aware of a security incident that affects your
          information, we will notify you and the relevant authorities as
          required by law.
        </p>
      ),
    },
    {
      heading: "Children",
      body: (
        <p>
          The Services are intended for business users and are not directed
          to children under 16. We do not knowingly collect personal
          information from children. If you believe a child has provided us
          with personal information, contact us and we will delete it.
        </p>
      ),
    },
    {
      heading: "Cookies & Do Not Track",
      body: (
        <p>
          You can control cookies through your browser settings and, where
          applicable, through a cookie banner on the site. Disabling some
          cookies may affect functionality. We do not currently respond to
          Do Not Track signals, as no common industry standard has been
          adopted.
        </p>
      ),
    },
    {
      heading: "Changes to This Policy",
      body: (
        <p>
          We may update this Policy from time to time. The &ldquo;Last
          updated&rdquo; date at the top reflects the most recent version.
          If we make material changes we will provide notice through the
          Services or by email.
        </p>
      ),
    },
    {
      heading: "Contact",
      body: (
        <p>
          Questions or requests related to privacy? Email{" "}
          <a
            href="mailto:privacy@querybay.com"
            className="font-medium text-[#a855f7] hover:underline"
          >
            privacy@querybay.com
          </a>
          .
        </p>
      ),
    },
  ],
};
