# dressup prototype: tokens and direction

From scratch. No existing app to copy. Direction settled with the user in the grill session.

## Direction
- Mode: Operate (a tool you use to do one job). The clothes are the only colour on the screen.
- Chrome: black, white, grey only. Red only for an error or a delete.
- Feel: shadcn "neutral". Quiet, flat surfaces, thin borders, real soft shadows on things that float.
- Theme: light and dark, follows the device. The wall behind the mannequin stays the same warm grey in both.
- Small actions are icon buttons (pencil, bin, plus, x, scale). Main actions keep words ("Save look").

## Values
- Font: Geist (400, 500, 600) for text. Titles: Instrument Serif. Codes and numbers: Geist Mono. Fallback: system UI.
- Size scale: 11, 12, 13, 14, 16, 20, 28 px.
- Radius: 12 px surfaces, 10 px controls, 6 px colour squares, 999 px chips.
- Light: background #FBFAF8, text #1A1917, card #FFFFFF, soft surface #F1EFEA, soft text #6E6A62, border #E6E2DA, primary #1A1917 on #FBFAF8, danger #B42318.
- Dark: background #121110, text #F4F1EA, card #1B1A18, soft surface #262421, soft text #A9A49A, border #302D29, primary #F4F1EA on #161513, danger #F97066.
- In the app these are the CSS variables --background, --foreground, --card, --muted, --muted-foreground, --border, --primary, --primary-foreground, --destructive in src/react-app/index.css.
- Wall: linear-gradient(90deg, #C6C2BC, #DAD6D0 40%, #D3CFC9 70%, #C3BFB9).
- Shadow (floating things): 0 18px 40px -12px rgba(40,32,20,.22), 0 2px 6px rgba(40,32,20,.06); in dark 0 18px 44px -12px rgba(0,0,0,.7), 0 2px 6px rgba(0,0,0,.4). Lift (things on the wall): 0 2px 10px rgba(40,32,20,.16).
- Motion: sheets and dialogs slide in, 260 ms, ease-out (cubic-bezier(.16,1,.3,1)). Nothing else moves.
- Icons: Lucide shapes, inline SVG, stroke 1.9.
- Layout: phone under 900 px (stage on top, tabs, bottom bar). Laptop from 900 px (top bar, columns).

## Mannequin
- Drawn by code as SVG. Body 400 x 800 units. Each garment is a flat exact hex with soft shading on top.
- Default skin #D6A27B, hair #141418. White shoes at all times.

## App icon
- The letter "d" in Instrument Serif, #FBFAF8 on a #1A1917 tile, corner radius 23%.
- The letter is 60% of the tile height. It is centred by the real edges of the letter, not by its text box.
- Files: icon/icon-512.png, icon/icon-64.png (browser tab), icon/apple-touch-icon.png (phone home screen). Made by icon.html.

## References
- Alta, wardrobe grid in select state: https://mobbin.com/screens/5140c386-cd5c-4abd-81b8-2b8e5c553b99
- ZARA, list in select state: https://mobbin.com/screens/465d15ba-0346-499d-b3a1-9e37f66d61fd
- Twenty, invite by email with icon buttons on each row: https://mobbin.com/screens/e8313c7a-707b-4479-80ce-c0119d7a420f
- Luma, host list with remove confirm: https://mobbin.com/screens/cf93c92d-0835-4882-8a3e-68e8e4971d1b
- Recraft, cards with ticks and a floating action bar: https://mobbin.com/screens/338b6ed9-5452-4432-a847-bd9b31491f30
