# build/generar-icono.ps1
# Genera build/icon.ico (multi-tamano) con la marca TMG: cuadrado rojo
# redondeado + texto blanco. Reproducible: no requiere herramientas externas,
# solo .NET (System.Drawing) incluido en Windows.
#
# Formato ICO canonico y de maxima compatibilidad: la entrada de 256 px va
# comprimida como PNG (convencion Vista+) y los tamanos menores como DIB/BMP
# clasico de 32 bits (BITMAPINFOHEADER + BGRA bottom-up + mascara AND).
# Los intermedios se escriben a archivos temporales (evita los problemas de
# PowerShell 5.1 con arrays de byte[] anidados).

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$carpeta = Split-Path -Parent $MyInvocation.MyCommand.Path
$salida = Join-Path $carpeta 'icon.ico'
$tamanos = @(256, 128, 64, 48, 32, 16)
$temp = Join-Path $env:TEMP "tmg-icono-$PID"
New-Item -ItemType Directory -Force $temp | Out-Null

foreach ($lado in $tamanos) {
    $bmp = New-Object System.Drawing.Bitmap($lado, $lado)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    # Cuadrado rojo con esquinas redondeadas (radio ~19% del lado)
    $radio = [Math]::Max(2, [int]($lado * 0.19))
    $d = $radio * 2
    $max = $lado - 1
    $ruta = New-Object System.Drawing.Drawing2D.GraphicsPath
    $ruta.AddArc(0, 0, $d, $d, 180, 90)
    $ruta.AddArc($max - $d, 0, $d, $d, 270, 90)
    $ruta.AddArc($max - $d, $max - $d, $d, $d, 0, 90)
    $ruta.AddArc(0, $max - $d, $d, $d, 90, 90)
    $ruta.CloseFigure()

    $rojo = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(185, 28, 28))
    $g.FillPath($rojo, $ruta)

    # Texto "TMG" centrado, blanco, negrita
    $fuente = New-Object System.Drawing.Font('Segoe UI', [float]($lado * 0.30), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $formato = New-Object System.Drawing.StringFormat
    $formato.Alignment = [System.Drawing.StringAlignment]::Center
    $formato.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, [float]($lado * 0.02), $lado, $lado)
    $g.DrawString('TMG', $fuente, [System.Drawing.Brushes]::White, $rect, $formato)

    if ($lado -ge 256) {
        # 256 px: entrada PNG (convencion Vista+)
        $bmp.Save((Join-Path $temp "$lado.bin"), [System.Drawing.Imaging.ImageFormat]::Png)
    } else {
        # Menores: DIB de 32 bits — BITMAPINFOHEADER + BGRA bottom-up + AND mask
        $ms = New-Object System.IO.MemoryStream
        $dibw = New-Object System.IO.BinaryWriter($ms)
        $filaMascara = [Math]::Ceiling($lado / 32.0) * 4      # filas alineadas a 32 bits
        $dibw.Write([UInt32]40)                               # biSize
        $dibw.Write([Int32]$lado)                             # biWidth
        $dibw.Write([Int32]($lado * 2))                       # biHeight (XOR + AND)
        $dibw.Write([UInt16]1)                                # biPlanes
        $dibw.Write([UInt16]32)                               # biBitCount
        $dibw.Write([UInt32]0)                                # biCompression (BI_RGB)
        $dibw.Write([UInt32]($lado * $lado * 4 + $filaMascara * $lado))
        $dibw.Write([Int32]0); $dibw.Write([Int32]0)          # ppm X/Y
        $dibw.Write([UInt32]0); $dibw.Write([UInt32]0)        # colores
        for ($y = $lado - 1; $y -ge 0; $y--) {                # BGRA bottom-up
            for ($x = 0; $x -lt $lado; $x++) {
                $px = $bmp.GetPixel($x, $y)
                $dibw.Write([Byte]$px.B); $dibw.Write([Byte]$px.G)
                $dibw.Write([Byte]$px.R); $dibw.Write([Byte]$px.A)
            }
        }
        for ($y = 0; $y -lt $lado; $y++) {                    # AND mask en cero
            for ($b = 0; $b -lt $filaMascara; $b++) { $dibw.Write([Byte]0) }
        }
        [System.IO.File]::WriteAllBytes((Join-Path $temp "$lado.bin"), $ms.ToArray())
        $dibw.Close()
    }
    $g.Dispose(); $bmp.Dispose(); $fuente.Dispose(); $rojo.Dispose(); $ruta.Dispose()
}

# --- Empaquetar en .ico ---
$fs = [System.IO.File]::Create($salida)
$bw = New-Object System.IO.BinaryWriter($fs)

# ICONDIR: reservado(2) + tipo=1(2) + cantidad(2)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$tamanos.Count)

# ICONDIRENTRY x N (16 bytes c/u); las imagenes van despues del directorio
$offset = 6 + (16 * $tamanos.Count)
foreach ($lado in $tamanos) {
    $largo = (Get-Item (Join-Path $temp "$lado.bin")).Length
    $dim = if ($lado -ge 256) { 0 } else { $lado }   # 0 significa 256
    $bw.Write([Byte]$dim)          # ancho
    $bw.Write([Byte]$dim)          # alto
    $bw.Write([Byte]0)             # paleta
    $bw.Write([Byte]0)             # reservado
    $bw.Write([UInt16]1)           # planos
    $bw.Write([UInt16]32)          # bits por pixel
    $bw.Write([UInt32]$largo)
    $bw.Write([UInt32]$offset)
    $offset += $largo
}
foreach ($lado in $tamanos) {
    $bw.Write([System.IO.File]::ReadAllBytes((Join-Path $temp "$lado.bin")))
}

$bw.Close(); $fs.Close()
Remove-Item -Recurse -Force $temp
Write-Host "OK: $salida ($((Get-Item $salida).Length) bytes)"
