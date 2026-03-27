import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3001;

// Validates that the URL is a LinkedIn profile URL
function isValidLinkedInUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.hostname === 'www.linkedin.com' || parsed.hostname === 'linkedin.com') &&
      parsed.pathname.startsWith('/in/')
    );
  } catch {
    return false;
  }
}

app.get('/api/scrape-linkedin', async (req, res) => {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'LinkedIn URL is required.' });
    return;
  }

  if (!isValidLinkedInUrl(url)) {
    res.status(400).json({ error: 'Please provide a valid LinkedIn profile URL (e.g. https://linkedin.com/in/username).' });
    return;
  }

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'RAPIDAPI_KEY is not configured in .env' });
    return;
  }

  try {
    const apiUrl = `https://fresh-linkedin-profile-data.p.rapidapi.com/get-linkedin-profile?linkedin_url=${encodeURIComponent(url)}&include_skills=true`;
    const response = await fetch(apiUrl, {
      headers: {
        'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com',
        'x-rapidapi-key': apiKey,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      res.status(response.status).json({ error: `RapidAPI error: ${text}` });
      return;
    }

    const data: any = await response.json();

    // Build a structured profile text to send to the frontend
    const lines: string[] = [];

    if (data.full_name) lines.push(`Name: ${data.full_name}`);
    if (data.headline) lines.push(`Title: ${data.headline}`);
    if (data.occupation) lines.push(`Occupation: ${data.occupation}`);
    if (data.city || data.country_full_name) {
      lines.push(`Location: ${[data.city, data.country_full_name].filter(Boolean).join(', ')}`);
    }
    if (data.summary) lines.push(`\nAbout:\n${data.summary}`);

    if (data.experiences?.length) {
      lines.push('\nWork Experience:');
      (data.experiences as any[]).slice(0, 4).forEach((exp) => {
        const start = exp.starts_at?.year ?? '';
        const end = exp.ends_at?.year ?? 'Present';
        const duration = start ? `${start}–${end}` : '';
        const header = [`- ${exp.title}`, exp.company, duration].filter(Boolean).join(' at ').replace(' at -', ' ');
        lines.push(header);
        if (exp.description) {
          lines.push(`  ${exp.description.slice(0, 300).replace(/\n/g, ' ')}`);
        }
      });
    }

    if (data.education?.length) {
      lines.push('\nEducation:');
      (data.education as any[]).slice(0, 2).forEach((edu) => {
        const degree = [edu.degree_name, edu.field_of_study].filter(Boolean).join(', ');
        lines.push(`- ${degree ? `${degree} at ` : ''}${edu.school}`);
      });
    }

    if (data.skills?.length) {
      lines.push(`\nKey Skills: ${(data.skills as string[]).slice(0, 8).join(', ')}`);
    }

    res.json({ profileText: lines.join('\n') });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Unexpected error fetching LinkedIn profile.' });
  }
});

app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});
