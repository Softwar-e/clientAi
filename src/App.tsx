import React, { useState } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Send, Copy, Check, Sparkles, User, Briefcase, Target, AlertCircle, ImagePlus, X } from 'lucide-react';
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
    if (!profileData.trim() || !product.trim()) {
      setError('Please provide both profile details and your product/service.');
      return;
    }

    setIsGenerating(true);
    setError('');
    setResult(null);

    try {
      const prompt = `
You are an expert B2B sales copywriter and growth hacker. Your job is to write highly personalized, conversion-optimized cold emails for a sales team.

Here is the context:
Profile URL or Text: ${profileData}
Product/Service being sold: ${product}
${painPoint ? `Specific pain point to target: ${painPoint}` : ''}
${imageFile ? `*Note: An image of the product/service has also been provided. Use any relevant visual details from it to enhance the pitch if applicable.*` : ''}

1. EXTRACT CONTEXT from the provided profile details (name, job title, company, industry, recent posts, bio, etc.).
2. WRITE A COLD EMAIL that:
   - Opens with a hyper-personalized hook referencing something specific from their profile.
   - Clearly but subtly introduces the product/service being sold.
   - Communicates a concrete value proposition relevant to THEIR specific role and industry.
   - Includes a low-friction CTA (e.g., a 15-min call, a reply, a free trial link).
   - Is under 150 words — punchy, human, never salesy.
   - Sounds like it was written by a real person, not a robot.

TONE: Confident, warm, peer-to-peer. Never use phrases like "I hope this email finds you well", "I wanted to reach out", or "synergy".

OUTPUT FORMAT: Return a JSON object with the following keys:
- "subject": Subject line (3–7 words, curiosity-inducing)
- "body": The email body (use \n for line breaks)
- "ps": Optional P.S. line (a powerful conversion trick, leave empty if not applicable)
- "explanation": 1-sentence explanation of WHY you wrote it this way
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

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
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
    const text = `Subject: ${result.subject}\n\n${result.body}${result.ps ? `\n\nP.S. ${result.ps}` : ''}`;
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
                <textarea
                  value={profileData}
                  onChange={(e) => setProfileData(e.target.value)}
                  placeholder="Paste LinkedIn/Instagram URL or profile details (bio, recent posts, role)..."
                  className="w-full h-32 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none text-sm outline-none"
                />
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
                disabled={isGenerating || !profileData.trim() || !product.trim()}
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
                <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Generated Email</span>
                  </div>
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                
                <div className="p-6 space-y-6">
                  <div>
                    <p className="text-sm font-medium text-slate-500 mb-1">Subject</p>
                    <p className="text-lg font-semibold text-slate-900">{result.subject}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium text-slate-500 mb-2">Body</p>
                    <div className="prose prose-slate prose-sm max-w-none">
                      <p className="whitespace-pre-wrap text-slate-700 leading-relaxed text-base">{result.body}</p>
                    </div>
                  </div>

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
