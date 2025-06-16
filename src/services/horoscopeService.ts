import { ClaudeService } from './claudeService';
import { prisma } from '../config/prisma';

interface HoroscopeReading {
  name: string;
  sign: string;
  horoscope: string;
}

interface HoroscopeData {
  theme: string;
  readings: HoroscopeReading[];
  generatedAt: string;
}

export class HoroscopeService {
  /**
   * Get zodiac sign from birth date
   */
  static getZodiacSign(dateOfBirth: Date): string {
    const month = dateOfBirth.getMonth() + 1; // JavaScript months are 0-indexed
    const day = dateOfBirth.getDate();

    if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return 'Aries';
    if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return 'Taurus';
    if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return 'Gemini';
    if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return 'Cancer';
    if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return 'Leo';
    if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return 'Virgo';
    if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return 'Libra';
    if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return 'Scorpio';
    if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return 'Sagittarius';
    if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return 'Capricorn';
    if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return 'Aquarius';
    return 'Pisces'; // Feb 19 - Mar 20
  }

  /**
   * Generate horoscope for a single user
   */
  static async generateHoroscope(userId: string): Promise<HoroscopeData> {
    try {
      console.log('🔮 [Horoscope Service] Generating horoscope for user:', userId);
      
      // Get user data with birth date
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          dateOfBirth: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get zodiac sign
      const sign = this.getZodiacSign(user.dateOfBirth);

      console.log('🔮 [Horoscope Service] User data:', {
        firstName: user.firstName,
        sign: sign,
      });

      // Format date of birth for prompt
      const birthDate = user.dateOfBirth;
      const formattedDate = `${birthDate.getMonth() + 1}/${birthDate.getDate()}/${birthDate.getFullYear()}`;

      // Add variety to the prompt opening
      const openings = [
        "The algorithm has analyzed your birth charts. The stars have seen your screen time.",
        "Mercury's in microwave mode. Your birth chart just leaked your browsing history.",
        "The cosmos ran a background check. Your zodiac sign has been fact-checked.",
        "The universe left you on read, then took screenshots. The stars are subtweeting.",
        "Astrology AI loaded your personality.exe. The planets cleared their cache.",
      ];
      const randomOpening = openings[Math.floor(Math.random() * openings.length)];

      // Force a specific theme to ensure variety
      const themes = [
        'Communication habits',
        'Money/spending behaviors', 
        'Dating/relationship patterns',
        'Work/productivity quirks',
        'Social media behaviors',
        'Self-care delusions',
        'Friend group dynamics',
        'Daily routines',
        'Emotional coping mechanisms',
        'Secret shames'
      ];
      const selectedTheme = themes[Math.floor(Math.random() * themes.length)];

      // Create prompt for Claude
      const prompt = `${randomOpening} Here's what the universe noticed today.

TODAY'S MANDATORY THEME: ${selectedTheme}

Participants:
${user.firstName}: Born ${formattedDate}

Return your cosmic callouts as a JSON object:
{
  "theme": "${selectedTheme}",
  "readings": [
    {
      "name": "person's name",
      "sign": "zodiac sign", 
      "horoscope": "EXACTLY 120-140 characters about ${selectedTheme}. One punchy observation. Like a perfect tweet."
    }
  ]

IMPORTANT: You MUST focus on ${selectedTheme} - do NOT write about communication/texts unless that's the selected theme!`;

      const system = `You are the voice behind a modern astrology app - sharp, witty, and culturally aware. You understand astrology deeply but deliver insights with a knowing wink. Your horoscopes are like those viral zodiac memes - hyper-specific, slightly roasting, but somehow still accurate.

Your tone is:
- Dry and matter-of-fact, like texting a friend who knows you too well
- Pop-culture savvy with references to modern life (Venmo, screen time, read receipts)
- Gently roasting each sign's worst habits while being oddly affirming
- Never mystical or flowery - more like a therapist who's also your group chat's funniest member

CRITICAL THEME REQUIREMENT: The user prompt specifies TODAY'S MANDATORY THEME. You MUST write about that specific theme and ONLY that theme. Do not default to communication habits unless explicitly told to. Each theme has specific behaviors:

- Communication habits: texts, emails, phone calls, read receipts, ghosting, response times
- Money/spending behaviors: Venmo requests, impulse buys, splitting bills, subscriptions, financial anxiety
- Dating/relationship patterns: dating apps, commitment issues, love languages, red flags, attachment styles
- Work/productivity quirks: emails, meetings, procrastination methods, deadlines, work-life balance
- Social media behaviors: posting frequency, story viewing, lurking patterns, follower anxiety, curated feeds
- Self-care delusions: skincare routines they don't follow, gym memberships, meditation apps, wellness trends
- Friend group dynamics: group chat roles, party behaviors, social hierarchies, FOMO, boundaries
- Daily routines: morning habits, sleep patterns, meal choices, time management, rituals
- Emotional coping mechanisms: therapy avoidance, comfort behaviors, denial patterns, stress responses
- Secret shames: guilty pleasures, hidden anxieties, embarrassing habits, private obsessions

Sign-specific trait bank to pull from:
Aries: Impatient, competitive, starts things they don't finish, apologizes by pretending nothing happened, acts first thinks later, main character energy
Taurus: Stubborn, comfort-seeking, holds grudges forever, has strong opinions about thread counts, never throws anything away, routine-obsessed
Gemini: Attention span of a goldfish, different personality in each group chat, changes their mind mid-sentence, gossips but hates drama, ghosts then wonders why you're mad
Cancer: Emotionally manipulative but in a caring way, saves every text message, cries at commercials, mom friend energy, passive-aggressive when hurt
Leo: Needs constant validation, performs basic tasks dramatically, takes selfies during emergencies, generous but needs credit, secretly insecure
Virgo: Anxious perfectionist, has a spreadsheet for their spreadsheets, notices everything wrong, gives unsolicited advice, stress-cleans
Libra: Can't make decisions, people-pleaser with secret judgments, spends too much on aesthetics, flirts without meaning to, avoids all conflict
Scorpio: Secretive, obsessive, remembers every slight, intense about everything, loyal until betrayed then you're dead to them, stalks exes online
Sagittarius: Commitment-phobic, brutally honest, books trips they can't afford, philosophical at inappropriate times, allergic to routine
Capricorn: Workaholic, emotionally constipated, judges everyone silently, practical to a fault, secretly very weird, aged 40 since birth
Aquarius: Contrarian, emotionally detached, explains why they're not like other people, humanitarian in theory only, ghosts for self-care
Pisces: Lives in fantasy world, cries a lot, gives too many chances, artistic but unproductive, plays victim, absorbs everyone's emotions

CRITICAL: Each horoscope MUST be between 120-140 characters (including spaces and punctuation). Think of it as a perfect tweet - one sharp, specific observation that combines their sign traits with today's theme.

VARIETY IS ESSENTIAL:
- NEVER start horoscopes with the same pattern (e.g., don't always start with "You...")
- Mix up sentence structures: statements, observations, accusations, predictions
- Vary opening words: Sometimes start with actions, behaviors, numbers, or observations
- Examples of varied openings: "3 unread emails...", "That spreadsheet from Tuesday...", "Everyone knows you...", "Still refreshing...", etc.

Style guide:
- Reference specific modern behaviors unique to each sign
- Use concrete details that vary between signs
- Be lovingly mean but with different angles for each sign
- Make it feel eerily specific while still being universal
- NEVER repeat similar behaviors or patterns between signs
- Keep it punchy and concise - every word counts within the 120-140 character limit`;

      console.log('🔮 [Horoscope Service] Fetching horoscope from AI...');

      // Generate horoscope using Claude with high temperature for variety
      const horoscopeResults = await ClaudeService.generateJSON<{
        theme: string;
        readings: Array<{name: string; sign: string; horoscope: string}>;
      }>(
        prompt,
        system,
        800, // Reduced for single user
        0.95 // High temperature for more variety
      );

      console.log('🔮 [Horoscope Service] AI response received:', {
        theme: horoscopeResults.theme,
        readingsCount: horoscopeResults.readings?.length,
        reading: horoscopeResults.readings?.[0],
      });

      // Validate we got a reading
      if (!horoscopeResults.readings || horoscopeResults.readings.length === 0) {
        throw new Error('No horoscope reading received');
      }

      // Create the horoscope data object
      const horoscopeData: HoroscopeData = {
        theme: horoscopeResults.theme,
        readings: horoscopeResults.readings,
        generatedAt: new Date().toISOString(),
      };

      return horoscopeData;
    } catch (error) {
      console.error('Error generating horoscopes:', error);
      throw error;
    }
  }
}