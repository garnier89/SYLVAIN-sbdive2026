import React, { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Copy, DownloadSimple, Printer, ShareNetwork } from '@phosphor-icons/react';
import { toast } from 'sonner';

// Merchant back-office "Partager ma boutique" — QR code + copyable link +
// download / print, so the shop can drive traffic straight into the app.
export const MerchantShareCard = ({ merchantId, storeName }) => {
  const qrRef = useRef(null);
  const url = `${window.location.origin}/food/${merchantId}`;
  const name = storeName || 'Ma boutique';

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); toast.success('Lien copié !'); }
    catch { toast.error('Copie impossible'); }
  };

  const downloadQR = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `QR-${name.replace(/\s+/g, '-')}.png`;
    a.click();
  };

  const printQR = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    const dataUrl = canvas ? canvas.toDataURL('image/png') : '';
    const w = window.open('', '_blank', 'width=480,height=680');
    if (!w) { toast.error('Autorisez les pop-ups pour imprimer'); return; }
    w.document.write(`<html><head><title>${name}</title></head>
      <body style="text-align:center;font-family:system-ui,sans-serif;padding:32px">
        <h1 style="margin:0 0 4px">${name}</h1>
        <p style="color:#555;margin:0 0 16px">Scannez pour commander dans l'app</p>
        <img src="${dataUrl}" style="width:320px;height:320px"/>
        <p style="font-size:12px;color:#777;word-break:break-all;margin-top:12px">${url}</p>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <Card data-testid="merchant-share-card">
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShareNetwork size={18} /> Partager ma boutique</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-500">Affichez ce QR code en magasin ou partagez le lien : vos clients arrivent directement sur votre boutique dans l'app.</p>
        <div ref={qrRef} className="flex justify-center bg-white p-4 rounded-xl border">
          <QRCodeCanvas value={url} size={180} level="M" marginSize={2} />
        </div>
        <div className="flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-2">
          <span className="text-xs text-gray-600 truncate flex-1" data-testid="share-link">{url}</span>
          <Button size="sm" variant="ghost" onClick={copyLink} data-testid="copy-link-btn" aria-label="Copier"><Copy size={16} /></Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={downloadQR} data-testid="download-qr-btn"><DownloadSimple size={16} className="mr-1" /> Télécharger</Button>
          <Button variant="outline" onClick={printQR} data-testid="print-qr-btn"><Printer size={16} className="mr-1" /> Imprimer</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default MerchantShareCard;
