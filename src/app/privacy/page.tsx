import LegalPage from "@/components/Legal/LegalPage";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | QueryBay",
  description:
    "How QueryBay collects, uses, shares, and protects your personal information.",
};

const PrivacyPage = () => {
  return (
    <LegalPage
      pageName="Privacy Policy"
      description="What we collect, why we collect it, and the choices you have over your personal information."
      lastUpdated="April 18, 2026"
      intro={
        <>
          <p>
            This Privacy Policy explains how QueryBay (&ldquo;QueryBay&rdquo;,
            &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) collects,
            uses, shares, and protects personal information when you visit our
            website, use our services, or otherwise interact with us. It
            applies to prospective customers, customers, their end recipients
            of outreach campaigns we operate, and candidates who apply to
            remote talent opportunities.
          </p>
          <p>
            If you disagree with this Policy, please do not use the Services.
          </p>
        </>
      }
      sections={[
        {
          heading: "Information We Collect",
          body: (
            <>
              <p>
                <strong>Information you give us.</strong> When you sign up,
                subscribe, or contact us, we collect your name, business email,
                company, role, billing address, phone number, and any
                information you submit through forms, calls, or chats.
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
                information about your interaction with the Services such as
                IP address, browser type, operating system, referring URLs,
                pages viewed, and timestamps.
              </p>
              <p>
                <strong>Payment data.</strong> Payments are processed by
                Stripe. We do not store full card numbers. Stripe provides us
                with a token, the last four digits, the card brand, and
                billing metadata.
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
                  Process payments, manage subscriptions, and send
                  transactional communications (receipts, onboarding, product
                  updates);
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
                  Comply with legal obligations and respond to lawful
                  requests.
                </li>
              </ul>
            </>
          ),
        },
        {
          heading: "Legal Bases for Processing (EEA / UK)",
          body: (
            <>
              <p>
                If you are in the European Economic Area or United Kingdom, we
                rely on one or more of the following legal bases:
                performance of a contract with you; our legitimate interests in
                running, improving, and securing the Services; compliance with
                a legal obligation; and, where required, your consent (which
                you may withdraw at any time).
              </p>
            </>
          ),
        },
        {
          heading: "How We Share Information",
          body: (
            <>
              <p>
                We do not sell personal information. We share it with:
              </p>
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
                  <strong>Authorities</strong> when required by law, subpoena,
                  or to protect the rights, property, or safety of QueryBay or
                  others;
                </li>
                <li>
                  <strong>Corporate transactions</strong>, in connection with
                  a merger, acquisition, financing, or sale of assets, subject
                  to customary confidentiality obligations.
                </li>
              </ul>
              <p>
                When we act as a processor on behalf of a customer, we share
                information only as instructed by that customer and in
                accordance with our data processing agreement.
              </p>
            </>
          ),
        },
        {
          heading: "International Transfers",
          body: (
            <>
              <p>
                QueryBay operates across Latin America, Ghana, and the United
                States, and our service providers operate globally. Personal
                information may be transferred to and processed in countries
                other than the one in which you are located. Where required,
                we implement appropriate safeguards such as Standard
                Contractual Clauses or equivalent mechanisms.
              </p>
            </>
          ),
        },
        {
          heading: "Data Retention",
          body: (
            <>
              <p>
                We retain personal information for as long as necessary to
                provide the Services, comply with legal obligations (such as
                tax, accounting, and anti-fraud requirements), resolve
                disputes, and enforce our agreements. When we no longer need
                information we delete or anonymize it.
              </p>
            </>
          ),
        },
        {
          heading: "Your Rights",
          body: (
            <>
              <p>
                Depending on where you live, you may have the right to:
                access a copy of your personal information; correct inaccurate
                information; delete information; restrict or object to certain
                processing; port your information to another service; opt out
                of targeted advertising or the &ldquo;sale&rdquo; or
                &ldquo;sharing&rdquo; of personal information (as those terms
                are defined under applicable law); and withdraw consent.
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
                If you are the end recipient of outreach run on behalf of one
                of our customers, your request will generally be forwarded to
                that customer, who is the controller of the list that was used
                to contact you.
              </p>
            </>
          ),
        },
        {
          heading: "Security",
          body: (
            <>
              <p>
                We use administrative, technical, and physical safeguards
                designed to protect personal information, including encryption
                in transit, access controls, and monitoring. No system is
                perfectly secure; if we become aware of a security incident
                that affects your information, we will notify you and the
                relevant authorities as required by law.
              </p>
            </>
          ),
        },
        {
          heading: "Children",
          body: (
            <>
              <p>
                The Services are intended for business users and are not
                directed to children under 16. We do not knowingly collect
                personal information from children. If you believe a child has
                provided us with personal information, contact us and we will
                delete it.
              </p>
            </>
          ),
        },
        {
          heading: "Cookies & Do Not Track",
          body: (
            <>
              <p>
                You can control cookies through your browser settings and,
                where applicable, through a cookie banner on the site.
                Disabling some cookies may affect functionality. We do not
                currently respond to Do Not Track signals, as no common
                industry standard has been adopted.
              </p>
            </>
          ),
        },
        {
          heading: "Changes to This Policy",
          body: (
            <>
              <p>
                We may update this Policy from time to time. The
                &ldquo;Last updated&rdquo; date at the top reflects the most
                recent version. If we make material changes we will provide
                notice through the Services or by email.
              </p>
            </>
          ),
        },
        {
          heading: "Contact",
          body: (
            <>
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
            </>
          ),
        },
      ]}
    />
  );
};

export default PrivacyPage;
