---
"@wuppycms/admin": patch
---

On a production server, class edits and deleting a theme element no longer reload the canvas: the class is applied in place and the CSS of new classes is fetched from the page, a deleted element is removed in place.
