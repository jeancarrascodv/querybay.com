"use client";
import * as React from "react";
import { Copy, Download, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useRouter } from "next/navigation";

/**
 * A reusable component to display a single DNS record row.
 */
const DnsRecordRow = ({
  type,
  name,
  value,
}: {
  type: string;
  name: string;
  value: string;
}) => (
  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center text-sm py-2 border-b border-slate-800 last:border-b-0">
    <div className="md:col-span-1 text-slate-400">{type}</div>
    <div className="md:col-span-5 text-slate-50 break-all">{name}</div>
    <div className="md:col-span-5 text-slate-50 break-all">{value}</div>
    <div className="md:col-span-1 flex justify-end">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 hover:bg-slate-700"
      >
        <Copy className="h-4 w-4 text-slate-400" />
      </Button>
    </div>
  </div>
);

export default function DomainAuthenticationPage() {
  const router = useRouter();
  const [step, setStep] = React.useState(1);

  const handleBack = () => {
    router.push("/integrations");
  };

  return (
    <div className="bg-[#0B1120] text-slate-50 p-8 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {step === 1 ? (
          // Step 1: Collect Domain Name and DNS Host
          <div>
            <div className="flex items-center mb-8">
              <Button
                variant="ghost"
                onClick={handleBack}
                className="mr-4 p-2 hover:bg-slate-800"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-3xl font-bold">Authenticate Your Domain</h1>
            </div>

            <div className="bg-[#101828] border border-slate-700 rounded-lg p-8">
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2">
                  Domain Authentication Setup
                </h2>
                <p className="text-slate-400">
                  To verify your domain ownership and secure your platform,
                  please provide the following details.
                </p>
              </div>

              <div className="grid gap-6 max-w-md">
                <div className="grid gap-2">
                  <label htmlFor="domain-name" className="text-sm font-medium">
                    Domain Name
                  </label>
                  <Input
                    id="domain-name"
                    placeholder="example.com"
                    className="bg-slate-900 border-slate-700 focus:ring-blue-500"
                  />
                </div>
                <div className="grid gap-2">
                  <label htmlFor="dns-host" className="text-sm font-medium">
                    DNS Host
                  </label>
                  <Input
                    id="dns-host"
                    placeholder="Cloudflare, GoDaddy, etc."
                    className="bg-slate-900 border-slate-700 focus:ring-blue-500"
                  />
                </div>
                <Button onClick={() => setStep(2)} className="w-fit">
                  Next: Setup DNS Records
                </Button>
              </div>
            </div>
          </div>
        ) : (
          // Step 2: Display DNS records to be added
          <div>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  className="mr-4 p-2 hover:bg-slate-800"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-3xl font-bold">Domain Authentication</h1>
              </div>
              <Button
                variant="outline"
                className="bg-slate-900 border-slate-700 hover:bg-slate-800"
              >
                <Download className="mr-2 h-4 w-4" />
                Download CSV with Records
              </Button>
            </div>

            <div className="space-y-8">
              {/* Install DNS Records Section */}
              <div className="bg-[#101828] border border-slate-700 rounded-lg p-8">
                <div className="mb-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-semibold mb-2">
                        Install DNS Records
                      </h2>
                      <p className="text-sm text-slate-400">
                        To complete the domain authentication process, manually
                        add the following DNS records to your domain name
                        service (DNS) provider.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="bg-slate-900 border-slate-700 hover:bg-slate-800"
                    >
                      Verification Required
                    </Button>
                  </div>

                  <p className="text-sm text-slate-400 mb-4">
                    Authenticating with these DNS mail servers validates that a
                    message has not been forged or altered in transit—which will
                    increase the performance of emails sent from Janium. You can
                    also click the link here on how to properly install the DNS
                    records below with your DNS host.
                  </p>

                  <h3 className="text-lg text-slate-50 font-medium mb-4">
                    Install the DNS records below to become domain verified
                  </h3>

                  <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 mb-6">
                    <div className="grid grid-cols-12 gap-4 text-sm font-medium text-slate-400 mb-2">
                      <div className="col-span-1">TYPE</div>
                      <div className="col-span-5">NAME</div>
                      <div className="col-span-5">VALUE</div>
                    </div>
                    <DnsRecordRow
                      type="CNAME"
                      name="em8x9o.janium-janium.io"
                      value="u28x9o.wl241.sendgrid.net"
                    />
                    <DnsRecordRow
                      type="CNAME"
                      name="s1._domainkey.janium-janium.io"
                      value="s1.domainkey.u28x9o.wl241.sendgrid.net"
                    />
                    <DnsRecordRow
                      type="CNAME"
                      name="s2._domainkey.janium-janium.io"
                      value="s2.domainkey.u28x9o.wl241.sendgrid.net"
                    />
                  </div>

                  <div className="flex items-center space-x-2 mb-4">
                    <Checkbox
                      id="dns-installed"
                      className="border-slate-600 data-[state=checked]:bg-blue-600"
                    />
                    <label
                      htmlFor="dns-installed"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      I have installed the DNS records above.
                    </label>
                  </div>
                  <Button>Verify DNS Records</Button>
                </div>
              </div>

              {/* Custom Mail From/SPF Section */}
              <div className="bg-[#101828] border border-slate-700 rounded-lg p-8">
                <div className="mb-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-xl font-semibold mb-2">
                        Custom Mail From Domain/SPF Authentication
                      </h2>
                      <p className="text-sm text-slate-400">
                        Custom mail from/SPF authenticated emails will be marked
                        as originating from your domain instead of a different
                        domain—which will increase the performance of emails
                        sent from Janium. You can also click the link here on
                        how to properly install the SPF records below with your
                        DNS host.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="bg-slate-900 border-slate-700 hover:bg-slate-800"
                    >
                      Verification Request
                    </Button>
                  </div>

                  <h3 className="text-lg text-slate-50 font-medium mb-4">
                    Install the DNS records below to set up your custom
                    mail-from domain name and become SPF authenticated.
                  </h3>

                  <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 mb-6">
                    <div className="grid grid-cols-12 gap-4 text-sm font-medium text-slate-400 mb-2">
                      <div className="col-span-1">TYPE</div>
                      <div className="col-span-5">NAME</div>
                      <div className="col-span-5">VALUE</div>
                    </div>
                    <DnsRecordRow
                      type="MX"
                      name="janium-janium.io"
                      value="10 feedback-smtp.us-west-2.amazonses.com"
                    />
                    <DnsRecordRow
                      type="TXT"
                      name="janium-janium.io"
                      value='"v=spf1 include:amazonses.com ~all"'
                    />
                  </div>

                  <div className="flex items-center space-x-2 mb-4">
                    <Checkbox
                      id="spf-installed"
                      className="border-slate-600 data-[state=checked]:bg-blue-600"
                    />
                    <label
                      htmlFor="spf-installed"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      I have installed the DNS records above.
                    </label>
                  </div>
                  <Button>Verify SPF Records</Button>
                </div>
              </div>

              {/* DMARC Section */}
              <div className="bg-[#101828] border border-slate-700 rounded-lg p-8">
                <div className="mb-6">
                  <h2 className="text-xl font-semibold mb-2">
                    Domain-based Message Authentication, Reporting, and
                    Conformance (DMARC)
                  </h2>
                  <p className="text-sm text-slate-400 mb-4">
                    DMARC specifies how email servers should handle messages
                    that fail the authentication checks—improving security and
                    providing reports on fraudulent email activity.
                  </p>

                  <h3 className="text-lg text-slate-50 font-medium mb-4">
                    If your domain doesn&apos;t currently have a valid DMARC
                    record, install the record below:
                  </h3>

                  <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 mb-6">
                    <div className="grid grid-cols-12 gap-4 text-sm font-medium text-slate-400 mb-2">
                      <div className="col-span-1">TYPE</div>
                      <div className="col-span-5">NAME</div>
                      <div className="col-span-5">VALUE</div>
                    </div>
                    <DnsRecordRow
                      type="TXT"
                      name="_dmarc.janium.io"
                      value='"v=DMARC1; p=none;"'
                    />
                  </div>

                  <div className="flex items-center space-x-2 mb-4">
                    <Checkbox
                      id="dmarc-installed"
                      className="border-slate-600 data-[state=checked]:bg-blue-600"
                    />
                    <label
                      htmlFor="dmarc-installed"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      My domain contains a DMARC Record.
                    </label>
                  </div>
                  <Button>Verify DMARC Record</Button>
                </div>
              </div>

              <div className="flex justify-between items-center pt-6">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="bg-slate-900 border-slate-700 hover:bg-slate-800"
                >
                  Back to Domain Setup
                </Button>
                <Button onClick={handleBack}>
                  Complete Domain Authentication
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
