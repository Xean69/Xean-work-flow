import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import SignaturePadLib from 'signature_pad'

// A thin wrapper around the signature_pad npm package — net-new to this
// codebase, since drawn e-signatures don't exist anywhere else (the
// move-in inspection e-sign flow is typed-name only). Exposes isEmpty()
// and getBlob() via ref so a parent form can validate/submit without this
// component needing to know anything about the surrounding form.
const SignaturePad = forwardRef(function SignaturePad(_props, ref) {
  const canvasRef = useRef(null)
  const padRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    // Crisp strokes on high-DPI screens — signature_pad draws in CSS
    // pixels, so the backing bitmap needs to be scaled up separately from
    // the element's on-page size.
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    canvas.width = canvas.offsetWidth * ratio
    canvas.height = canvas.offsetHeight * ratio
    canvas.getContext('2d').scale(ratio, ratio)

    padRef.current = new SignaturePadLib(canvas, { backgroundColor: 'rgb(255, 255, 255)' })
    return () => padRef.current?.off()
  }, [])

  useImperativeHandle(ref, () => ({
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    clear: () => padRef.current?.clear(),
    getBlob: () =>
      new Promise((resolve) => {
        canvasRef.current.toBlob((blob) => resolve(blob), 'image/png')
      }),
  }))

  return <canvas ref={canvasRef} className="signature-pad-canvas" />
})

export default SignaturePad
