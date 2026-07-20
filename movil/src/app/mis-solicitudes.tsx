// src/app/mis-solicitudes.tsx
// "Mis días libres" para RRHH/Admin: sus solicitudes personales.
// (El empleado ve esta misma vista directamente en la pestaña Solicitudes.)

import { Protegido } from '../auth/Protegido'
import { MisSolicitudesView } from '../features/solicitudes/MisSolicitudesView'

export default function MisSolicitudesScreen() {
  return (
    <Protegido rolRequerido="rrhh">
      <MisSolicitudesView />
    </Protegido>
  )
}
