'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { Notice, Sheet } from '@/components/ui';

/**
 * Lecture d'un code-barres par la caméra (maquettes 3 et 5).
 *
 * Au comptoir, taper « SAC-CIM-001 » sur un clavier de téléphone pendant qu'un
 * client attend est exactement ce que l'application doit éviter. Le code lu
 * remplit le champ de recherche : le scan n'est qu'un raccourci de saisie, et
 * tout reste faisable à la main si la caméra refuse.
 *
 * Deux moteurs, choisis à l'ouverture :
 *
 * — `BarcodeDetector`, natif sur Chrome Android, ne coûte rien à charger ;
 * — sinon `@zxing/browser`, importé seulement à cet instant, qui couvre iOS où
 *   aucun navigateur n'expose l'API native.
 *
 * Importer ZXing paresseusement compte : la bibliothèque pèse plus lourd que
 * le reste de l'écran, et la majorité des ventes se passent de scanner.
 */

/** Formats utiles en quincaillerie : étiquettes fabricant et codes internes. */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];

/**
 * `BarcodeDetector` n'est pas dans la bibliothèque standard de TypeScript : il
 * n'existe que sur Chrome. On en décrit ici le strict nécessaire plutôt que de
 * le prendre pour `any`.
 */
interface BarcodeDetectorLike {
  new (options: { formats: string[] }): {
    detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
  };
}

export default function BarcodeScanner({
  onScan,
  className = 'scan-button',
  label = 'Scanner',
}: {
  onScan: (code: string) => void;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Fonction d'arrêt du moteur courant, posée à l'ouverture et appelée à la
  // fermeture : sans elle la caméra resterait allumée derrière la feuille.
  const stopRef = useRef<(() => void) | null>(null);

  const close = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setOpen(false);
  }, []);

  const found = useCallback(
    (text: string) => {
      const code = String(text || '').trim();
      if (!code) return;
      stopRef.current?.();
      stopRef.current = null;
      setOpen(false);
      onScan(code);
    },
    [onScan]
  );

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;

    (async () => {
      const video = videoRef.current;
      if (!video) return;

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Ce navigateur n'ouvre pas la caméra. Saisissez le code à la main.");
        return;
      }

      try {
        // Caméra arrière : celle que l'on pointe vers l'étiquette.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = stream;
        await video.play().catch(() => {});

        const stopStream = () => stream.getTracks().forEach((track) => track.stop());

        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          const detector = new (
            window as unknown as { BarcodeDetector: BarcodeDetectorLike }
          ).BarcodeDetector({ formats: FORMATS });
          let frame = 0;
          const tick = async () => {
            if (cancelled) return;
            try {
              const codes = await detector.detect(video);
              const first = codes[0];
              if (first) return found(first.rawValue);
            } catch {
              // Une image illisible n'est pas une erreur : on retente à la suivante.
            }
            frame = requestAnimationFrame(tick);
          };
          stopRef.current = () => {
            cancelled = true;
            cancelAnimationFrame(frame);
            stopStream();
          };
          frame = requestAnimationFrame(tick);
          return;
        }

        // Pas d'API native (iOS) : on charge le lecteur à la demande.
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) {
          stopStream();
          return;
        }
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (result) found(result.getText());
        });
        stopRef.current = () => {
          cancelled = true;
          controls.stop();
          stopStream();
        };
      } catch (issue) {
        if (cancelled) return;
        setError(
          issue instanceof DOMException && issue.name === 'NotAllowedError'
            ? "L'accès à la caméra a été refusé. Autorisez-le, ou saisissez le code à la main."
            : "La caméra n'a pas pu démarrer. Saisissez le code à la main."
        );
      }
    })();

    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [open, found]);

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={label}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <ScanLine size={20} />
      </button>

      <Sheet open={open} title="Scanner un code-barres" onClose={close}>
        {error ? <Notice tone="warn">{error}</Notice> : null}
        <div className="scan-frame">
          {/* muted et playsInline : sans eux, iOS refuse la lecture automatique. */}
          <video ref={videoRef} muted playsInline />
          <span className="scan-frame__reticle" aria-hidden="true" />
        </div>
        <p className="small muted" style={{ textAlign: 'center' }}>
          Présentez l’étiquette dans le cadre.
        </p>
      </Sheet>
    </>
  );
}
