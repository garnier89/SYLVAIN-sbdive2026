import React, { useEffect, useState, useCallback } from 'react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { serviceSettingsAPI } from '../../services/api';
import {
  SlidersHorizontal, Check, ArrowSquareOut, Car, Bicycle, Package,
  ForkKnife, Bag, FirstAid, Pill, MapPin, Trash, Plus,
} from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

const ICONS = { Car, Bicycle, Package, ForkKnife, Bag, FirstAid, Pill };

const ServiceCard = ({ svc, onSaved }) => {
  const navigate = useNavigate();
  const [active, setActive] = useState(svc.active);
  const [note, setNote] = useState(svc.info_note || '');
  const [fields, setFields] = useState(svc.fields || {});
  const [zones, setZones] = useState(svc.zones || []);
  const [zoneForm, setZoneForm] = useState({ type: 'radius', name: '', lat: '', lng: '', radius_km: '' });
  const [saving, setSaving] = useState(false);
  const Icon = ICONS[svc.icon] || SlidersHorizontal;

  const addZone = () => {
    if (!zoneForm.name) { toast.error('Nom de la zone requis'); return; }
    if (zoneForm.type === 'radius' && (!zoneForm.lat || !zoneForm.lng || !zoneForm.radius_km)) {
      toast.error('Latitude, longitude et rayon requis'); return;
    }
    setZones([...zones, { ...zoneForm }]);
    setZoneForm({ type: 'radius', name: '', lat: '', lng: '', radius_km: '' });
  };
  const removeZone = (idx) => setZones(zones.filter((_, i) => i !== idx));

  const save = async () => {
    setSaving(true);
    try {
      const cleanFields = {};
      svc.fields_schema.forEach((f) => { cleanFields[f.key] = Number(fields[f.key]) || 0; });
      const cleanZones = zones.map((z) => ({
        id: z.id, type: z.type, name: z.name,
        lat: z.type === 'radius' ? Number(z.lat) : null,
        lng: z.type === 'radius' ? Number(z.lng) : null,
        radius_km: z.type === 'radius' ? Number(z.radius_km) : null,
      }));
      await serviceSettingsAPI.adminUpdate(svc.service_key, { active, info_note: note, fields: cleanFields, zones: cleanZones });
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

      {/* Zones d'opération */}
      <div className="mt-4 mb-3 border-t border-gray-100 pt-3">
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin size={15} weight="duotone" className="text-gray-600" />
          <span className="text-xs font-bold text-gray-700">Zones d'opération</span>
          <span className="text-[10px] text-gray-400">(vide = partout)</span>
        </div>
        {zones.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {zones.map((z, idx) => (
              <div key={z.id || idx} className="flex items-center justify-between bg-gray-50 rounded-lg px-2.5 py-1.5 text-xs" data-testid={`zone-${svc.service_key}-${idx}`}>
                <span className="text-gray-700">
                  {z.type === 'radius' ? '◯' : '🏙'} <strong>{z.name}</strong>
                  {z.type === 'radius' ? ` — ${z.radius_km} km` : ' — ville'}
                </span>
                <button onClick={() => removeZone(idx)} className="text-red-400" data-testid={`zone-del-${svc.service_key}-${idx}`}><Trash size={14} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 items-center">
          <select value={zoneForm.type} onChange={(e) => setZoneForm({ ...zoneForm, type: e.target.value })} className="border rounded-lg px-2 py-1 text-xs" data-testid={`zone-type-${svc.service_key}`}>
            <option value="radius">Rayon</option>
            <option value="city">Ville</option>
          </select>
          <input value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} placeholder="Nom (ex: Paris)" className="border rounded-lg px-2 py-1 text-xs w-28" data-testid={`zone-name-${svc.service_key}`} />
          {zoneForm.type === 'radius' && (
            <>
              <input value={zoneForm.lat} onChange={(e) => setZoneForm({ ...zoneForm, lat: e.target.value })} placeholder="lat" className="border rounded-lg px-2 py-1 text-xs w-16" data-testid={`zone-lat-${svc.service_key}`} />
              <input value={zoneForm.lng} onChange={(e) => setZoneForm({ ...zoneForm, lng: e.target.value })} placeholder="lng" className="border rounded-lg px-2 py-1 text-xs w-16" data-testid={`zone-lng-${svc.service_key}`} />
              <input value={zoneForm.radius_km} onChange={(e) => setZoneForm({ ...zoneForm, radius_km: e.target.value })} placeholder="km" className="border rounded-lg px-2 py-1 text-xs w-14" data-testid={`zone-radius-${svc.service_key}`} />
            </>
          )}
          <button onClick={addZone} className="bg-gray-900 text-white rounded-lg px-2 py-1 text-xs flex items-center gap-1" data-testid={`zone-add-${svc.service_key}`}><Plus size={12} /> Ajouter</button>
        </div>
      </div>

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
