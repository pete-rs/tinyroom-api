# iOS Horoscope Feature Implementation Guide

## Overview
A new element type "HOROSCOPE" has been added that generates personalized horoscope readings for all room participants using Claude AI.

## How It Works

1. User taps "Generate Horoscopes" button
2. API calls Claude to generate personalized horoscopes for all participants based on their zodiac signs
3. A horoscope element is created on the canvas (shows as 🔮 crystal ball emoji)
4. Tapping the crystal ball shows all participants' horoscope readings

## API Endpoints

### Generate Horoscopes
**Endpoint**: `POST /api/horoscope/rooms/:roomId/generate`

**Authorization**: Requires authentication token

**Response**:
```json
{
  "data": {
    "introduction": "With Mercury in retrograde and the waning gibbous moon in Virgo, today's energies favor careful planning over bold action. The earth-fire combination in this room creates an interesting dynamic - Capricorn's methodical approach meets Leo's creative spark.",
    "horoscopes": [
      {
        "userId": "user-id-1",
        "firstName": "John",
        "sign": "Capricorn",
        "horoscope": "Saturn's influence strengthens your natural leadership today, making it an ideal time for organizing and structuring plans. However, with Mercury retrograde, double-check details before committing to major decisions."
      },
      {
        "userId": "user-id-2",
        "firstName": "Sarah",
        "sign": "Leo",
        "horoscope": "The Sun's trine with Jupiter amplifies your creative energy and charisma. Your fire element is particularly strong today - channel it into collaborative projects rather than solo ventures for best results."
      }
    ],
    "generatedAt": "2025-06-14T..."
  }
}
```

### Create Horoscope Element
After generating horoscopes, create the element using the existing socket event:

```javascript
socket.emit('element:create', {
  roomId: 'room-id',
  type: 'horoscope',
  positionX: 100,
  positionY: 200,
  width: 60,
  height: 60,
  content: JSON.stringify(horoscopeData) // The full response from generate endpoint
});
```

## Element Display

### Visual Representation
- Display as 🔮 crystal ball emoji
- Standard element size (60x60 recommended)
- Can be moved/dragged like other elements
- Can be deleted by any participant

### Interaction
When user taps the horoscope element:
1. Parse the `content` field as JSON
2. Display a modal/sheet showing all horoscopes
3. Show who generated it and when
4. Format each horoscope nicely with user name and zodiac sign

## Data Structure

### Element Model
```typescript
interface HoroscopeElement {
  id: string;
  type: 'horoscope';
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  content: string; // JSON stringified HoroscopeData
  createdBy: string;
  createdAt: Date;
}

interface HoroscopeData {
  introduction: string;
  horoscopes: Array<{
    userId: string;
    firstName: string;
    sign: string;
    horoscope: string;
  }>;
  generatedAt: string;
}
```

## UI/UX Recommendations

### Adding Horoscopes
1. Add "Generate Horoscopes" button in element creation menu
2. Show loading state while generating (takes 2-3 seconds)
3. Automatically place the crystal ball element at a default position
4. Show success feedback

### Viewing Horoscopes
When displaying horoscopes:
1. Parse the `content` JSON to get horoscope data
2. For each horoscope entry, look up the participant's current name using the userId
3. Display in a modal/sheet

Modal/Sheet design:
```
┌─────────────────────────────┐
│ 🔮 Daily Horoscope          │ 
│ Generated at 3:45pm         │
├─────────────────────────────┤
│ "With Mercury in retrograde │
│ and the waning gibbous moon │
│ in Virgo..."                │
├─────────────────────────────┤
│ John (Capricorn ♑)         │
│ "Saturn's influence..."     │
│                             │
│ Sarah (Leo ♌)              │
│ "The Sun's trine with..."   │
│                             │
│ [Close]                     │
└─────────────────────────────┘
```

Display the introduction at the top to set the mystical mood before showing individual readings.


### Error Handling
- If horoscope generation fails, show error message
- Retry option available
- Falls back gracefully if Claude API is unavailable

## Implementation Steps

1. **Add Horoscope Button**
   - Add to element creation menu
   - Icon: 🔮 or custom horoscope icon

2. **Generate Horoscopes**
   ```swift
   func generateHoroscopes(for roomId: String) {
     APIClient.post("/api/horoscope/rooms/\(roomId)/generate") { result in
       switch result {
       case .success(let data):
         self.createHoroscopeElement(with: data)
       case .failure(let error):
         // Show error
       }
     }
   }
   ```

3. **Create Element**
   ```swift
   func createHoroscopeElement(with data: HoroscopeData) {
     let content = try! JSONEncoder().encode(data)
     socket.emit("element:create", [
       "roomId": roomId,
       "type": "horoscope",
       "positionX": defaultX,
       "positionY": defaultY,
       "width": 60,
       "height": 60,
       "content": String(data: content, encoding: .utf8)!
     ])
   }
   ```

4. **Display Element**
   - Show 🔮 emoji at element position
   - Add tap gesture recognizer
   - Parse content JSON on tap
   - Show horoscope modal

## Push Notifications
When a horoscope element is added, other participants receive:
- Title: "New Content"
- Message: "{userName} added a horoscope reading in {roomName}"

## Notes
- Horoscopes are generated based on participants' birth dates (already in system)
- Features "Madame Celeste" - a seasoned astrologer who provides grounded, knowledgeable readings
- Each generation includes:
  - An introduction mentioning real astrological conditions (moon phases, planetary positions, seasonal influences)
  - Individual readings (2-3 sentences per person) with practical insights
- Readings reference actual astrological elements:
  - Current transits and planetary positions
  - Ruling planets and elemental qualities
  - Moon phases and seasonal influences
  - Sign-specific traits and current astrological weather
- Does NOT reference room names (since they might be auto-generated or dates)
- Includes current firstName for each participant in the response
- All participants can view, move, or delete horoscope elements