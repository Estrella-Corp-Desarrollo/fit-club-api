# Multi-club para coaches (fitclub-api)

- Atletas: siguen con `user.club` oneToOne (sin cambio de modelo).
- Coaches: `user.clubs` manyToMany (membresía) + `user.club` = **club activo**.
- Bootstrap migra `club → clubs` para usuarios existentes.
- Acceso coach a atletas: solo dentro del **club activo** (`assertClubAthleteAccess`).
- Endpoints:
  - `PUT /app/me/active-club` `{ "clubId": 2 }` — cambia club activo (debe estar en membresía).
  - `POST /app/me/clubs` `{ "clubId": 2, "setActive": false }` — agrega club a la membresía.
- Web: selector “Club activo” en el header cuando hay 2+ clubs; en `/club` se puede agregar otro club por ID.
