---
trigger: always_on
---

# CWF Change Reflection Rules

Any changes to simulator ui or functinality now on muct be taken cwf functionality in considirection.

- if new ui element added make sure cwf has ability to control taht component as well

- If new parameter added to simulation either as a control parameter of part of simulator ourcome. Then this needs to have a appropriate mirroring at supabase. If it is not clear then please ask how to integrate. DO nto over look.

- If new simulator behaviour controlling parameter added then make sure cwf has access to read it from supabase and sends a new value to change this piece of data.
