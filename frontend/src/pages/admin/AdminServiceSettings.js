import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { serviceSettingsAPI } from '../../services/api';
import {
  SlidersHorizontal, Check, ArrowSquareOut, Car, Bicycle, Package,
  ForkKnife, Bag, FirstAid, Pill,
} from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

const ICONS = { Car, Bicycle, Package, ForkKnife, Bag, FirstAid, Pill };

const ServiceCard = ({ svc, onSaved }) => {
  const navigate = useNavigate();
  const [active, setActive] = useState(svc.active);
  const [note, setNote] = useState(svc.info_note || '');
  const [fields, setFields] = useState(svc.fields || {});
  const [saving, setSaving] = useState(false);
  const Icon = ICONS[svc.icon] || SlidersHorizontal;

  const save = async () => {
    setSaving(true);
    try {
      const cleanFields = {};
      svc.fields_schema.forEach((f) => { cleanFields[f.key] = Number(fields[f.key]) || 0; });
      await serviceSettingsAPI.adminUpdate(svc.service_key, { active, info_note: note, fields: cleanFields });
      toast.success(`${svc.label} enregistré`);
      onSaved?.();
    } catch { toast.error('Échec de l\'enregistrement'); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4" data-testid={`service-card-${svc.service_key}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
          <Icon size={20} weight="duotone" className="text-gray-700" />
        </div>
        <h3 className="font-bold text-gray-900">{svc.label}</h3>
        <button
          onClick={() => setActive((a) => !a)}
          data-testid={`toggle-${svc.service_key}`}
          className={`ml-auto w-11 h-6 rounded-full relative transition-colors ${active ? 'bg-green-500' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${active ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>

      <label className="text-xs font-semibold text-gray-500">Bannière / note client</label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ex: Livraison sous 45 min"
        className="w-full border rounded-lg px-3 py-2 text-sm mt-1 mb-3"
        data-testid={`note-${svc.service_key}`}
      />

      {svc.advanced_link ? (
        <button
          onClick={() => navigate(svc.advanced_link)}
          className="text-sm font-semibold text-[#FF4500] flex items-center gap-1 mb-3"
          data-testid={`advanced-${svc.service_key}`}
        >
          Configuration avancée (catégories, produits…) <ArrowSquareOut size={15} />
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-3">
          {svc.fields_schema.map((f) => (
            <div key={f.key}>
              <label className="text-[11px] text-gray-500">{f.label} ({f.suffix})</label>
              <input
                type="number" step="0.1"
                value={fields[f.key] ?? ''}
                onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                className="w-full border rounded-lg px-2 py-1.5 text-sm mt-0.5"
                data-testid={`field-${svc.service_key}-${f.key}`}
              />
            </div>
          ))}
        </div>
      )}

      <Button size="sm" onClick={save} disabled={saving} data-testid={`save-${svc.service_key}`}>
        <Check size={15} className="mr-1" />{saving ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </div>
  );
};

const AdminServiceSettings = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    serviceSettingsAPI.adminList().then((r) => setServices(r.data || [])).catch(() => toast.error('Erreur de chargement')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="admin-service-settings-page">
      <div className="flex items-center gap-2 mb-1">
        <SlidersHorizontal size={26} weight="duotone" className="text-[#FF4500]" />
        <h1 className="text-xl font-bold text-gray-900">Paramètres des services</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">Activez/désactivez chaque service, gérez sa bannière client et sa tarification — au même endroit.</p>

      {loading ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((svc) => <ServiceCard key={svc.service_key} svc={svc} onSaved={load} />)}
        </div>
      )}
    </div>
  );
};

export default AdminServiceSettings;
