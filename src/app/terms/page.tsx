import LegalPage from "@/components/Legal/LegalPage";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | QueryBay",
  description:
    "The terms that govern your use of QueryBay's growth, outreach, and remote talent services.",
};

const TermsPage = () => {
  return (
    <LegalPage
      pageName="Terms of Service"
      description="The agreement between you and QueryBay when you use our services, subscribe to a plan, or hire talent through the platform."
      lastUpdated="April 18, 2026"
      intro={
        <>
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your access to
            and use of the websites, applications, and services (collectively,
            the &ldquo;Services&rdquo;) operated by QueryBay (&ldquo;QueryBay&rdquo;,
            &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;). By accessing
            or using the Services, or by clicking to accept these Terms, you
            agree to be bound by them. If you are entering into these Terms on
            behalf of a company or other legal entity, you represent that you
            have the authority to bind that entity, in which case
            &ldquo;you&rdquo; or &ldquo;Customer&rdquo; refers to that entity.
          </p>
          <p>
            If you do not agree to these Terms, do not use the Services.
          </p>
        </>
      }
      sections={[
        {
          heading: "The Services",
          body: (
            <>
              <p>
                QueryBay provides growth marketing, multichannel outreach
                (including LinkedIn, email, WhatsApp, and voice), and remote
                talent sourcing and outsourcing services across Latin America
                and Ghana. Specific scope, deliverables, and performance
                expectations are described in your subscription plan, an order
                form, or a separate statement of work.
              </p>
              <p>
                We may update, modify, or discontinue features from time to
                time. We will not make changes that materially reduce the core
                functionality of a paid plan during an active billing period
                without reasonable notice.
              </p>
            </>
          ),
        },
        {
          heading: "Eligibility & Accounts",
          body: (
            <>
              <p>
                To use the Services you must be at least 18 years old and
                capable of forming a binding contract. You are responsible for
                maintaining the confidentiality of your account credentials and
                for all activity that occurs under your account. Notify us
                promptly at support@querybay.com if you suspect unauthorized
                access.
              </p>
            </>
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
                You agree to treat placed professionals with professionalism
                and in accordance with applicable anti-discrimination,
                workplace safety, and labor laws. Misconduct, harassment, or
                unlawful directions toward placed professionals may result in
                immediate suspension or termination of the Services.
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
                  lawful basis to process, or that was obtained through
                  scraping in violation of a platform&apos;s terms;
                </li>
                <li>
                  Use the Services for activities that are discriminatory,
                  deceptive, defamatory, or fraudulent, or that promote
                  illegal goods or services;
                </li>
                <li>
                  Reverse-engineer, resell, sublicense, or white-label the
                  Services without our express written consent;
                </li>
                <li>
                  Interfere with, disrupt, or attempt to gain unauthorized
                  access to our systems or the accounts of other customers.
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
                You retain ownership of all data, content, and lists you
                provide to us (&ldquo;Customer Data&rdquo;). You grant QueryBay
                a limited, worldwide, non-exclusive license to host, process,
                and transmit Customer Data solely to provide, improve, and
                support the Services.
              </p>
              <p>
                You represent and warrant that you have all rights, consents,
                and lawful bases required to provide Customer Data to us and to
                instruct us to contact the individuals it describes. Where
                required by law (for example, under GDPR or similar
                frameworks), we will enter into a data processing agreement
                with you upon request.
              </p>
            </>
          ),
        },
        {
          heading: "Third-Party Services",
          body: (
            <>
              <p>
                The Services integrate with or rely on third parties including
                Stripe (payments), LinkedIn, email providers, WhatsApp, voice
                and telephony providers, and analytics tools. We are not
                responsible for the availability, policies, or acts of those
                third parties, and their terms and privacy policies apply to
                your use of their services. Changes they make to their
                platforms (for example, rate limits or API changes) may affect
                features of the Services.
              </p>
            </>
          ),
        },
        {
          heading: "Intellectual Property",
          body: (
            <>
              <p>
                QueryBay and its licensors own all right, title, and interest
                in and to the Services, including all software, models,
                workflows, templates, playbooks, and documentation, and all
                associated intellectual property rights. No rights are granted
                to you other than as expressly set forth in these Terms.
              </p>
              <p>
                Feedback you provide about the Services is not confidential,
                and you grant us an unrestricted, royalty-free license to use
                and incorporate it.
              </p>
            </>
          ),
        },
        {
          heading: "Confidentiality",
          body: (
            <>
              <p>
                Each party may receive non-public information from the other
                that is confidential or proprietary (&ldquo;Confidential
                Information&rdquo;). The receiving party will use the same
                degree of care it uses to protect its own confidential
                information (and in no event less than reasonable care) and
                will use Confidential Information only to perform its
                obligations or exercise its rights under these Terms.
              </p>
            </>
          ),
        },
        {
          heading: "Disclaimers",
          body: (
            <>
              <p>
                THE SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
                AVAILABLE&rdquo;. TO THE MAXIMUM EXTENT PERMITTED BY LAW,
                QUERYBAY DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED,
                INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
                NON-INFRINGEMENT, AND ANY WARRANTIES ARISING FROM A COURSE OF
                DEALING OR USAGE OF TRADE. WE DO NOT WARRANT SPECIFIC LEAD,
                CONVERSION, REVENUE, OR HIRING OUTCOMES, AND RESULTS MAY VARY
                BY INDUSTRY, OFFER, AND MARKET CONDITIONS.
              </p>
            </>
          ),
        },
        {
          heading: "Limitation of Liability",
          body: (
            <>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, NEITHER PARTY WILL BE
                LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
                PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUES, DATA, OR
                GOODWILL, ARISING OUT OF OR RELATED TO THESE TERMS OR THE
                SERVICES. OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING
                OUT OF OR RELATED TO THESE TERMS WILL NOT EXCEED THE AMOUNTS
                PAID OR PAYABLE BY YOU TO QUERYBAY IN THE TWELVE (12) MONTHS
                PRECEDING THE EVENT GIVING RISE TO THE CLAIM.
              </p>
            </>
          ),
        },
        {
          heading: "Indemnification",
          body: (
            <>
              <p>
                You will defend, indemnify, and hold harmless QueryBay, its
                affiliates, and their respective officers, directors,
                employees, and agents from and against any third-party claims,
                damages, liabilities, and expenses (including reasonable
                attorneys&apos; fees) arising out of or related to (a) your use
                of the Services in violation of these Terms or applicable law,
                (b) Customer Data, or (c) your interactions with placed
                professionals or end recipients of outreach.
              </p>
            </>
          ),
        },
        {
          heading: "Termination",
          body: (
            <>
              <p>
                You may cancel your subscription at any time as described
                above. We may suspend or terminate the Services immediately if
                you materially breach these Terms, fail to pay amounts due, or
                engage in conduct that exposes QueryBay or other customers to
                legal, reputational, or security risk. Sections that by their
                nature should survive termination will survive, including
                sections on Intellectual Property, Confidentiality, Disclaimers,
                Limitation of Liability, and Indemnification.
              </p>
            </>
          ),
        },
        {
          heading: "Governing Law & Disputes",
          body: (
            <>
              <p>
                These Terms are governed by the laws of the State of Delaware,
                United States, without regard to its conflict of law
                principles. The parties consent to the exclusive jurisdiction
                of the state and federal courts located in Delaware for any
                dispute arising out of or related to these Terms, except that
                either party may seek injunctive relief in any competent
                jurisdiction to protect its intellectual property or
                Confidential Information.
              </p>
            </>
          ),
        },
        {
          heading: "Changes to These Terms",
          body: (
            <>
              <p>
                We may update these Terms from time to time. If we make
                material changes we will provide notice through the Services
                or by email. Changes take effect on the date stated in the
                updated Terms. Your continued use of the Services after the
                effective date constitutes acceptance of the updated Terms.
              </p>
            </>
          ),
        },
        {
          heading: "Contact",
          body: (
            <>
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
            </>
          ),
        },
      ]}
    />
  );
};

export default TermsPage;
