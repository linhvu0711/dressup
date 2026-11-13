# dressup prototype: scope

One page, the whole first version. Phone layout under 900px, laptop layout from 900px.

## Shell
- Phone: bottom bar with "Dress" and "Looks". Gear icon at the top of each page opens Settings.
- Laptop: top bar with the name, "Dress", "Looks", and the gear at the right.

## Sign-in
- Open sign-up: any person with a Google account can sign in. No email list.
- Sign-in page: app name, "Sign in with Google" button. States: signed in, signed out, sign-ups closed.
- Sign-ups closed page: message for new people, sign-in button for people with an account.

## Dress page
- Mannequin stage, always in view. States: loaded, loading (grey placeholder).
- Phone: two tabs under the stage, "Mode" and "Colours". Laptop: three columns (modes, mannequin, colours).
- Mode picker: tabs Hot, Cool, Cold, Training. Picture cards in the current colours. A click puts the mode on. Training modes carry a "Training" label.
- Colour rows: one row per garment of the mode, top layer first, bottom last. A click on a square puts that colour on.
- Jacket switch: "Open" or "Closed" in the row of the chore jacket and the padded jacket.
- "+" on a row opens the colour picker: hex box, drag square, hue slider. The mannequin changes live. "Add" and "Cancel". Esc closes.
  - Bad hex: "Add" is off, red hint. A code with no "#" works. A 3-character code grows to 6.
  - A colour that is in the row already: the old square is selected, with a message.
- "Edit" above the rows puts an "x" on each square. "Done" ends it. A row keeps one square as a minimum.
- The bookmark button ("Save look") opens the save form: name (optional), tag chips, "+ New tag", "Cancel", "Save". Esc closes.
- Edit state: bar "Editing: <name>" with "x". Button reads "Save changes". The form then has "Save as new" and "Save changes".

## Looks page
- Filter chips: All, Hot, Cool, Cold, then your tags, then a pencil chip ("Edit tags").
- Wall of cards: picture, name, first tag. States: loaded, loading, empty ("No looks yet", "Go to Dress").
- Phone: a tap on a card opens the look page. Laptop: the look shows in a panel at the right.
- Look page or panel: large picture, name, tags, each garment with its colour code (a click copies the code), pencil = Edit, bin = Delete with a confirm box.
- Scale icon = compare. Circles come on the cards, "N picked", "x" to stop, "Compare N" button from 2 picks. Limit 6, with a message at the 7th.
- Compare view: the picked looks in a row at full height, sideways scroll on a phone. Back button.
- Edit tags: list with pencil = rename, bin = delete (confirm box, looks stay), and "+ New tag".

## Settings page
- Mannequin: skin colour and hair colour, each opens the same colour picker, with a small preview.
- "Delete my account": bin icon, confirm box, then the sign-in page.
- "Sign out".

## Global
- Toast messages.
- Theme: device, light, dark. The wall behind the mannequin stays the same grey.
- Saving: works, fails ("Not saved" bar with "Retry").
- Looks limit (300 for each account): under, reached (the save form shows a red hint and "Save" is off).
- Screen: auto, phone (forces the phone layout in a frame).
