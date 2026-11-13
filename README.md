# dressup

A web app that shows your clothes on a drawn mannequin, in your colours, so you can judge which colours go together before you put them on.

Status: design is done. The build has not started.

## The prototype is the reference

`docs/prototype/dressup.html` is a working model of the whole app. Build the app to look and behave like it.

- `docs/prototype/dressup.html`: the prototype. One file, no build step.
- `docs/prototype/scope.md`: each screen, control, and state the prototype has.
- `docs/prototype/tokens.md`: colours, fonts, sizes, and the real-app screens it borrows from.
- `docs/prototype/icon/`: the app icon files.
- `docs/prototype/walk.js`: an automatic click-through of the prototype.

To open it, start a small web server in the folder and open the page:

```sh
cd docs/prototype && python3 -m http.server 8791 --bind 127.0.0.1
# then open http://127.0.0.1:8791/dressup.html
```

The dark box at the top right is a test panel. It is not part of the app. It puts the app into states that are hard to reach by hand, for example "saving fails". The backtick key hides it.

In the prototype, the data is fake and nothing is saved.
