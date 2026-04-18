const channels = [
  {
    name: "LinkedIn",
    desc: "Connection requests, InMails, and content",
    color: "from-[#0077b5] to-[#00a0dc]",
  },
  {
    name: "Cold Email",
    desc: "Warmed-up domains, AI-personalized copy",
    color: "from-[#ef4444] to-[#f97316]",
  },
  {
    name: "WhatsApp",
    desc: "Conversational nurturing and direct closing",
    color: "from-[#25d366] to-[#128c7e]",
  },
  {
    name: "Voice & Video",
    desc: "Cold calling, VSLs, and AI voice agents",
    color: "from-[#a855f7] to-[#ec4899]",
  },
];

const AboutSectionOne = () => {
  return (
    <section
      id="about"
      className="relative overflow-hidden py-20 md:py-28 lg:py-32"
    >
      <div className="container">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
          <div>
            <span className="mb-4 inline-block rounded-full border border-black/10 bg-white/60 px-4 py-1 text-xs font-medium text-black/70 backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:text-white/80">
              Multichannel Outreach
            </span>
            <h2 className="mb-6 text-3xl font-bold tracking-tight text-black sm:text-4xl md:text-5xl dark:text-white">
              We reach your prospects{" "}
              <span className="bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] bg-clip-text text-transparent">
                wherever they are
              </span>
            </h2>
            <p className="mb-10 text-base leading-relaxed text-black/60 sm:text-lg dark:text-white/70">
              We don&apos;t rely on a single channel. We orchestrate coordinated
              campaigns across LinkedIn, email, WhatsApp, and voice to maximize
              the chance of a conversation with every target account.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              {channels.map((c) => (
                <div
                  key={c.name}
                  className="rounded-2xl border border-black/5 bg-white/60 p-5 backdrop-blur-md dark:border-white/10 dark:bg-white/5"
                >
                  <div
                    className={`mb-3 inline-flex h-2 w-2 rounded-full bg-gradient-to-br ${c.color}`}
                  />
                  <h4 className="mb-1 text-base font-semibold text-black dark:text-white">
                    {c.name}
                  </h4>
                  <p className="text-sm text-black/55 dark:text-white/60">
                    {c.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Visual: Dashboard mock */}
          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-[linear-gradient(135deg,#6366f1,#a855f7,#ec4899)] opacity-20 blur-3xl" />
            <div className="relative overflow-hidden rounded-3xl border border-black/10 bg-white/80 p-6 backdrop-blur-xl dark:border-white/10 dark:bg-[#0f1220]/80">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <div className="text-xs text-black/50 dark:text-white/50">
                    Weekly pipeline
                  </div>
                  <div className="text-2xl font-bold text-black dark:text-white">
                    347 replies
                  </div>
                </div>
                <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  +32.4%
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { label: "LinkedIn", value: 78, color: "from-[#6366f1] to-[#8b5cf6]" },
                  { label: "Email", value: 92, color: "from-[#a855f7] to-[#ec4899]" },
                  { label: "WhatsApp", value: 54, color: "from-[#10b981] to-[#06b6d4]" },
                  { label: "Voice", value: 34, color: "from-[#f59e0b] to-[#ef4444]" },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-black/60 dark:text-white/60">
                        {row.label}
                      </span>
                      <span className="font-medium text-black/80 dark:text-white/80">
                        {row.value}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${row.color}`}
                        style={{ width: `${row.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3 border-t border-black/5 pt-6 dark:border-white/10">
                <div>
                  <div className="text-xs text-black/50 dark:text-white/50">Meetings</div>
                  <div className="text-lg font-bold text-black dark:text-white">48</div>
                </div>
                <div>
                  <div className="text-xs text-black/50 dark:text-white/50">Email CTR</div>
                  <div className="text-lg font-bold text-black dark:text-white">12.8%</div>
                </div>
                <div>
                  <div className="text-xs text-black/50 dark:text-white/50">Reply rate</div>
                  <div className="text-lg font-bold text-black dark:text-white">9.1%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSectionOne;
