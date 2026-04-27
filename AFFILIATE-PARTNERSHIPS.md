# Affiliate partnerships — how to actually get them

Status: **none signed yet.** This doc is a reference for the next 1-2 weeks of partnership outreach. The site already has the scaffolding (bills page, direct-pay alternatives block); we just need real affiliate links to drop in.

## Why bother

Three revenue paths from this audience, ranked by realism:

| Path | Per-conversion | Difficulty to start | Notes |
|---|---|---|---|
| **Imaging center referrals** (RadNet, SimonMed) | $20-150/booking | Medium | Their referral programs exist but require an application. |
| **Bill negotiation referrals** (Goodbill, Resolve) | $50-200/customer | Easy | Goodbill has a public partner program; sign-up is a form. |
| **Insurance shopping** (Stride, eHealth, Healthcare.com) | $50-300/applicant | Medium | These have aggressive affiliate programs but the audience match is weaker. |

For year 1, focus on the first two. Insurance is a year-2 layer.

## RadNet — the biggest LA opportunity

**Why it's the right partner:** 70+ LA imaging centers under brands you'd recognize (Liberty Pacific Imaging, Beverly Hills Imaging, ProMed Imaging, Tower Saint John's Imaging, Coastal Imaging). They're publicly traded (RDNT), they actively want price-shopping patients, and they have a referral infrastructure.

**How to apply:**

1. Go to https://www.radnet.com/los-angeles/contact (or the equivalent contact page for whatever metro)
2. Look for "business development" or "partnerships" — likely listed under their corporate site at https://www.radnetinc.com
3. Direct email: most major imaging chains route partnership inquiries through `bd@radnetinc.com` or their corporate communications email. Worth trying `partnerships@radnet.com` or `marketing@radnet.com`
4. Pitch is short: "We run [Itemized.health], a hospital-price-comparison consumer site. ~X monthly visitors looking specifically for procedures you offer. We send qualified leads with no upfront cost on your end. Standard referral terms ok."
5. They'll likely route you to a regional marketing manager or their digital partnerships lead. Expect 2-4 weeks of back-and-forth before any paperwork.

**What success looks like:** a unique RadNet referral URL with tracking, and a per-booking commission ($30-100 typical for diagnostic imaging).

## SimonMed Imaging — secondary

**Why:** smaller LA footprint than RadNet (15-20 centers) but they have aggressive cash pricing and an established direct-to-consumer marketing arm.

**How:** https://www.simonmed.com/about-us/contact-us — request to speak with their digital marketing team. They run a public "SimonOne Membership" program that's essentially a direct-pay subscription, so they're set up for consumer relationships.

## Goodbill — the easiest first win

**Why:** their entire business model depends on getting patients with high bills, which is exactly our audience after they look at $30K knee surgery prices.

**How:**

1. Go to https://goodbill.com (their consumer site) and look for "Partners" or "Affiliates" footer link
2. Failing that: email `hello@goodbill.com` or `partnerships@goodbill.com`. They're a startup, response will probably be quick.
3. Pitch: "We send patients to your service from Itemized.health, a hospital-price-comparison site. Bills page is already built [link to /bills.html]. We'd love to add your tracked referral link. Standard 35%-of-savings model works for us."

**What's already in place:** `ui/bills.html` already lists Goodbill as the recommended partner. The link `/go/goodbill` is currently just an HTML anchor — we'd update it to point to your tracked URL once you have one.

## Resolve Medical Bills — backup if Goodbill doesn't accept

Same model as Goodbill, more established. Their partnership inquiry: https://www.resolvemedicalbills.com/contact

## What to set up BEFORE outreach

1. **Domain.** Itemized.health needs to be live. They'll Google your site as part of vetting. Ship the soft launch first, then start partnership outreach.

2. **Volume claim.** Don't lie, but you need to be able to say *something* when they ask "what's your traffic like?" Even "we're at X monthly visitors and growing 20% month-over-month" with a real number is fine. Two weeks post-launch and after one HN/Twitter spike, you'll have data.

3. **Referral tracking redirect.** Right now the bills page links go to `/go/goodbill`. We need to wire that to a real redirect (vercel.json rewrite or a tiny Edge function). When you sign with a partner, you'll plug their tracked URL in there. **Already configured in `ui/dist/vercel.json`** for caching, but the redirect rules need adding when you have URLs.

4. **Disclosure copy.** Already in `bills.html`. The line "We earn a referral fee when you use Goodbill through this page" satisfies FTC disclosure requirements. Don't ship without it.

5. **Email contact form on the site.** Right now we link "info@itemized.health" or similar. You'll need that working before you can credibly pitch partners.

## Realistic timeline

- **Week 1 post-launch:** soft outreach to Goodbill (easy yes), apply to RadNet
- **Week 2-3:** RadNet decision; pitch SimonMed
- **Week 4-6:** first revenue (probably $200-2000/month from Goodbill alone, depending on traffic)
- **Month 3+:** RadNet/SimonMed pipeline; insurance shopping experiments

## What NOT to do

- **Don't take money from hospitals or insurers.** That kills the whole moat. The line is: revenue from adjacent services the user is already looking for, never from the entities being compared.
- **Don't over-promise volume.** If you say "10K monthly visitors" and you have 2K, the partner walks. Honest numbers work better than padded ones.
- **Don't accept exclusivity in your first contract.** Easy to give away, hard to claw back. Multi-partner is the right answer for v1.
- **Don't skip the disclosure.** FTC fines for undisclosed affiliate links are real.

## Drafted outreach email template

Subject: Partnership inquiry — Itemized.health (hospital price comparison)

> Hi,
>
> I'm reaching out from Itemized.health, a consumer site that compares hospital prices using CMS-mandated transparency files. We launched [DATE]; current coverage is X hospitals across Y metros, with [TRAFFIC NUMBER] monthly visitors.
>
> Our user is, by definition, price-sensitive — they came to us looking for the cheapest place to get a knee MRI / colonoscopy / cataract surgery / etc. When the cheapest hospital in their area is still $1500+ for an outpatient scan, [PARTNER NAME] is the obvious better answer.
>
> I'd love to add a tracked referral link to [PARTNER NAME] on the relevant procedure pages. Happy to start with whatever standard partnership terms you offer.
>
> What's the right next step?
>
> — [Your Name]
> https://itemized.health
> [phone or email]

Save this template, customize per partner, send.
