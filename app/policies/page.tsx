import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Business policies',
  description: 'Current SHATVIKA CORNER collection, cancellation, refund, privacy, and tax information.',
};

const policies = [
  {
    id: 'delivery',
    title: 'Collection and delivery status',
    value: `Delivery is currently unavailable. New orders are for counter collection at SHATVIKA CORNER and have no delivery fee.${process.env.BUSINESS_DELIVERY_POLICY?.trim() ? `\n\n${process.env.BUSINESS_DELIVERY_POLICY.trim()}` : ''}`,
    missing: '',
  },
  { id: 'cancellation', title: 'Cancellation and refunds', value: process.env.BUSINESS_CANCELLATION_REFUND_POLICY, missing: 'The owner must confirm cancellation cut-offs, refund eligibility, method, and timing before publishing this policy.' },
  { id: 'privacy', title: 'Privacy notice', value: process.env.BUSINESS_PRIVACY_NOTICE, missing: 'The owner or legal adviser must supply the privacy notice, data-contact details, retention terms, and applicable rights.' },
  { id: 'tax', title: 'Tax information', value: process.env.BUSINESS_TAX_INFORMATION, missing: 'The configured checkout tax basis points require owner/accountant confirmation. This application does not determine the legally applicable rate.' },
] as const;

export default function PoliciesPage() {
  const contactEmail = process.env.NEXT_PUBLIC_BUSINESS_EMAIL?.trim();
  return (
    <main id="main-content" className="min-h-screen bg-[#0a0a0a] px-5 py-16 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-[#FF8C00] hover:underline">← Back to SHATVIKA CORNER</Link>
        <h1 className="mt-8 text-4xl font-black">Business policies</h1>
        <p className="mt-3 text-gray-400">Only owner-supplied terms are presented as policy. Missing information is explicitly identified below.</p>
        <div className="mt-10 space-y-6">
          {policies.map(policy => {
            const value = policy.value?.trim();
            return <section key={policy.id} id={policy.id} className="scroll-mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6" aria-labelledby={`${policy.id}-title`}>
              <h2 id={`${policy.id}-title`} className="text-xl font-bold">{policy.title}</h2>
              {value ? <p className="mt-3 whitespace-pre-line leading-7 text-gray-300">{value}</p> : <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm leading-6 text-amber-100"><p className="font-semibold">Owner-supplied policy not yet configured.</p><p className="mt-1 text-amber-200/80">{policy.missing}</p></div>}
            </section>;
          })}
        </div>
        <p className="mt-8 text-sm text-gray-500">Questions: {contactEmail ? <a className="text-[#FF8C00] hover:underline" href={`mailto:${contactEmail}`}>{contactEmail}</a> : 'business contact details await owner confirmation.'}</p>
      </div>
    </main>
  );
}
