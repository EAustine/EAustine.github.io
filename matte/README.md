# Matte

Drop or paste a screenshot and get a version worth sharing.

The background is built from the picture's own colours, then pushed away from
its overall lightness so the image reads as an object rather than sinking into
its own ground. A matte is the mount board cut around a print, and in
compositing it is the mask that separates figure from ground. Both are what
this does.

Solid and gradient palettes are generated rather than hand-picked, so no
combination clashes with itself. Thirty 3D emoji are included and can be
placed, dragged and resized on the canvas.

Built as a single HTML file with no dependencies and no build step. Editing,
colour extraction and export all happen in the browser. Nothing is uploaded
unless you ask for a share link, which puts the finished image in Supabase
Storage so other people can open it.

Share offers three routes: the native share sheet where the device has one,
the clipboard where the browser allows it, and a link. Only the link uploads.

Emoji from Microsoft Fluent Emoji (MIT).
