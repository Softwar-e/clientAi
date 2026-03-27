import React, { useState } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Send, Copy, Check, Sparkles, User, Briefcase, Target, AlertCircle, ImagePlus, X, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function App() {
  const [profileData, setProfileData] = useState('');
  const [product, setProduct] = useState('');
  const [painPoint, setPainPoint] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{
    subject: string;
    body: string;
    ps: string;
    explanation: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');

  const fetchLinkedInProfile = async () => {
    if (!linkedinUrl.trim()) return;
    setIsFetching(true);
    setError('');
    try {
      const res = await fetch(`/api/scrape-linkedin?url=${encodeURIComponent(linkedinUrl)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch profile');
      setProfileData(data.profileText);
      if (data.email) setRecipientEmail(data.email);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsFetching(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const handleGenerate = async () => {
    if (!linkedinUrl.trim() || !product.trim()) {
      setError('Please provide a LinkedIn URL and your product/service.');
      return;
    }

    setIsGenerating(true);
    setError('');
    setResult(null);

    // Auto-fetch LinkedIn profile before generating
    let profile = profileData.trim();
    if (!profile && linkedinUrl.trim()) {
      try {
        const res = await fetch(`/api/scrape-linkedin?url=${encodeURIComponent(linkedinUrl)}`);
        const data = await res.json();
        if (res.ok && data.profileText) {
          // Decode HTML entities that may come from scraped content
          const txt = data.profileText
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\[Note:.*?\]/gs, '')
            .trim();
          profile = txt;
          setProfileData(profile);
          if (data.email) setRecipientEmail(data.email);
          if (data.debug) console.log('[scraper debug]', data.debug);
        }
      } catch {
        // LinkedIn blocked — proceed with just the URL
      }
    }
    const effectiveProfile = profile || `LinkedIn profile: ${linkedinUrl.trim()}`;

    const isProfileBlocked = effectiveProfile.startsWith('LinkedIn profile:') && !effectiveProfile.includes('\n');

    try {
      const prompt = isProfileBlocked
        ? `
You are a B2B sales copywriter writing a cold email.

IMPORTANT: You have NO information about this prospect. Their LinkedIn profile could not be accessed.
Do NOT invent any name, job title, company, or personal details whatsoever.
Write a short, generic cold email addressed to "there" or with no personal greeting at all.
Mention only the product/service and a clear CTA. Keep it under 100 words.

Product/Service being sold: ${product}
${painPoint ? `Pain point to address: ${painPoint}` : ''}

OUTPUT FORMAT — return ONLY a JSON object:
- "subject": 3-7 word subject line
- "body": Email body (use \\n for line breaks, NO HTML tags, NO invented names or companies)
- "ps": empty string
- "explanation": "LinkedIn profile was not accessible — wrote a generic email without personal details."
`
        : `
You are an elite B2B sales copywriter specialising in job-role-driven cold outreach.

Here is the ONLY information you have about the prospect. Do NOT invent, assume, or add any details not explicitly present below — no company names, locations, titles, or facts that are not stated:

--- PROSPECT PROFILE START ---
${effectiveProfile}
--- PROSPECT PROFILE END ---

Product/Service being sold: ${product}
${painPoint ? `Specific pain point to target: ${painPoint}` : ''}
${imageFile ? `*Note: An image of the product/service has also been provided.*` : ''}

INSTRUCTIONS:
1. Read the profile. Identify the person's actual name, job title, company, and any details explicitly mentioned.
2. Write a cold email that:
   - Addresses them by first name only.
   - References only their ACTUAL role/company/details from the profile above — never invent anything.
   - Connects the product/service to a real pressure someone in that role faces.
   - Ends with a low-friction CTA (15-min call, a reply, etc.).
   - Is under 150 words. Human, peer-to-peer, never salesy.
   - Uses plain text only — NO HTML tags like <br>.
3. If the profile has limited info, keep it grounded in what IS there.

TONE: Direct, warm, credible. Avoid: "I hope this finds you well", "I wanted to reach out", "synergy", "game-changer".

OUTPUT FORMAT — return ONLY a JSON object:
- "subject": 3-7 word subject line
- "body": Email body (use \\n for line breaks, NO HTML tags)
- "ps": Optional P.S. line, empty string if not needed
- "explanation": 1 sentence — which specific profile fact drove your angle
`;

      const parts: any[] = [{ text: prompt }];
      
      if (imageFile && imagePreview) {
        const base64Data = imagePreview.split(',')[1];
        parts.push({
          inlineData: {
            data: base64Data,
            mimeType: imageFile.type,
          }
        });
      }

      const generateWithModel = async (model: string) => {
        return ai.models.generateContent({
          model,
          contents: { parts },
          config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING },
              body: { type: Type.STRING },
              ps: { type: Type.STRING },
              explanation: { type: Type.STRING },
            },
            required: ['subject', 'body', 'explanation'],
          },
        },
      });
      };

      // Try primary model, retry once after a delay, then fall back to stable model
      let response;
      try {
        response = await generateWithModel('gemini-2.5-flash-preview-05-20');
      } catch (e: any) {
        if (e?.message?.includes('429') || e?.message?.includes('RESOURCE_EXHAUSTED')) {
          await new Promise(r => setTimeout(r, 2000));
        }
        try {
          response = await generateWithModel('gemini-2.0-flash');
        } catch {
          throw new Error('Gemini API quota exceeded. Please wait a few minutes and try again, or upgrade your API plan at https://ai.google.dev.');
        }
      }

      const jsonStr = response.text?.trim() || '{}';
      const parsed = JSON.parse(jsonStr);
      setResult(parsed);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to generate email. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (!result) return;
    const toLine = recipientEmail ? `To: ${recipientEmail}\n` : '';
    const text = `${toLine}Subject: ${result.subject}\n\n${result.body}${result.ps ? `\n\nP.S. ${result.ps}` : ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
              <Send className="w-5 h-5" />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">ColdMail AI</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Input Section */}
          <div className="lg:col-span-5 space-y-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight mb-1">Craft your pitch</h2>
              <p className="text-slate-500 text-sm">Generate hyper-personalized cold emails that convert.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
              {/* Profile Input */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <User className="w-4 h-4 text-slate-400" />
                  Prospect Profile
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={linkedinUrl}
                    onChange={(e) => { setLinkedinUrl(e.target.value); setProfileData(''); setRecipientEmail(''); }}
                    placeholder="https://linkedin.com/in/username"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm outline-none"
                  />
                  {isFetching && <Loader2 className="w-4 h-4 animate-spin text-slate-400 mt-2.5 shrink-0" />}
                </div>
                {recipientEmail ? (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Email found</label>
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="text-sm font-medium text-emerald-800 truncate">{recipientEmail}</span>
                    </div>
                  </div>
                ) : result && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Email</label>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
                      <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-sm text-slate-400">Could not find email address</span>
                    </div>
                  </div>
                )}

              </div>

              {/* Product Input */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Briefcase className="w-4 h-4 text-slate-400" />
                  Your Product / Service
                </label>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                    placeholder="e.g. AI-powered CRM for real estate agents"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm outline-none"
                  />
                  
                  {/* Image Upload */}
                  {imagePreview ? (
                    <div className="relative inline-block">
                      <img src={imagePreview} alt="Product preview" className="h-20 w-20 object-cover rounded-lg border border-slate-200 shadow-sm" />
                      <button
                        onClick={removeImage}
                        className="absolute -top-2 -right-2 bg-white text-slate-500 hover:text-red-500 rounded-full p-1 shadow-sm border border-slate-200 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-slate-400 transition-all text-sm text-slate-600 cursor-pointer">
                      <ImagePlus className="w-4 h-4 text-slate-400" />
                      <span>Attach product photo (optional)</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Pain Point Input */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Target className="w-4 h-4 text-slate-400" />
                  Specific Pain Point <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={painPoint}
                  onChange={(e) => setPainPoint(e.target.value)}
                  placeholder="e.g. Spending too much time on manual data entry"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm outline-none"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={isGenerating || isFetching || !linkedinUrl.trim() || !product.trim()}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium py-3 px-4 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Generate Email
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Output Section */}
          <div className="lg:col-span-7">
            {result ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
              >
                {/* Product photo hero — shown when an image was attached */}
                {imagePreview && (
                  <div className="relative w-full h-52 overflow-hidden">
                    <img
                      src={imagePreview}
                      alt="Product"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                    <div className="absolute bottom-4 left-5 right-5">
                      <p className="text-white/70 text-xs uppercase tracking-widest mb-1">Subject</p>
                      <p className="text-white text-lg font-semibold drop-shadow leading-snug">{result.subject}</p>
                    </div>
                    <button
                      onClick={copyToClipboard}
                      className="absolute top-3 right-3 flex items-center gap-1.5 text-sm font-medium text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                )}

                {/* Header bar — only shown when no image */}
                {!imagePreview && (
                  <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Generated Email</span>
                    <button
                      onClick={copyToClipboard}
                      className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm cursor-pointer"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                )}

                <div className="p-6 space-y-6">
                  {/* To field — shown when email was found */}
                  {recipientEmail && (
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-1">To</p>
                      <p className="text-base text-slate-900">{recipientEmail}</p>
                    </div>
                  )}

                  {/* Subject — only shown when no image (image hero shows it) */}
                  {!imagePreview && (
                    <div>
                      <p className="text-sm font-medium text-slate-500 mb-1">Subject</p>
                      <p className="text-lg font-semibold text-slate-900">{result.subject}</p>
                    </div>
                  )}
                  
                  <div>
                    <p className="text-sm font-medium text-slate-500 mb-2">Body</p>
                    <div className="prose prose-slate prose-sm max-w-none">
                      <p className="whitespace-pre-wrap text-slate-700 leading-relaxed text-base">{result.body.replace(/<br\s*\/?>/gi, '\n').replace(/\n\n+/g, '\n\n').trim()}</p>
                    </div>
                  </div>

                  {/* Product image inline in email body */}
                  {imagePreview && (
                    <div className="rounded-xl overflow-hidden border border-slate-100 shadow-sm">
                      <img src={imagePreview} alt="Product" className="w-full object-cover max-h-64" />
                    </div>
                  )}

                  {result.ps && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                      <p className="text-sm font-medium text-amber-800 mb-1">P.S.</p>
                      <p className="text-sm text-amber-900">{result.ps}</p>
                    </div>
                  )}

                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="bg-indigo-100 p-1.5 rounded-md mt-0.5 shrink-0">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-indigo-900 mb-1">Why this works</p>
                        <p className="text-sm text-indigo-800 leading-relaxed">{result.explanation}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4">
                  <Send className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-medium text-slate-900 mb-2">Ready to write</h3>
                <p className="text-slate-500 max-w-sm">
                  Fill in the prospect's details and your product info on the left to generate a highly personalized cold email.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
