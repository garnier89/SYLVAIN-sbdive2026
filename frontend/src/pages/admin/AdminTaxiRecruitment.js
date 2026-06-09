import React, { useState, useEffect, useCallback } from 'react';
import { Car, MapPin, Warning, Lightning, PaperPlaneTilt, CircleNotch, CheckCircle, ShieldCheck, ShieldSlash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { dispatchAdminAPI, adminAPI } from '../../services/api';

const AdminTaxiRecruitment = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({}); // driverId -> 'activate' | 'invite'

  const load = useCallback(async () => {
    try {
      const r = await dispatchAdminAPI.taxiRecruitment();
      setData(r.data);
    } catch { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const activate = async (cand, zone) => {
    setBusy((b) => ({ ...b, [cand.driver_id]: 'activate' }));
    try {
      const services = Array.from(new Set([...(cand.services || []), 'taxi']));
      await adminAPI.setDriverServiceTypes(cand.driver_id, services);
      toast.success(`Taxi activé pour ${cand.name}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
    finally { setBusy((b) => ({ ...b, [cand.driver_id]: undefined })); }
  };

  const invite = async (cand, zone) => {
    setBusy((b) => ({ ...b, [cand.driver_id]: 'invite' }));
    try {
      await dispatchAdminAPI.inviteTaxi(cand.driver_id, zone);
      toast.success(`Invitation envoyée à ${cand.name}`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'Échec'); }
    finally { setBusy((b) => ({ ...b, [cand.driver_id]: undefined })); }
  };

  const totals = data?.totals || { hot_zones: 0, candidates: 0, min_pending: 3 };

  return (
    <div className="p-6" data-testid="admin-taxi-recruitment">
      <div className="flex items-center gap-3 mb-1">
        <Car size={26} weight="fill" className="text-[#FF5000]" />
        <h1 className="text-2xl font-bold text-gray-800">Recrutement Taxi par zone</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Zones à forte demande taxi (≥ {totals.min_pending} courses en attente <strong>et</strong> demande &gt; chauffeurs taxi en ligne) avec les chauffeurs livraison/coursier à proximité, à activer ou inviter en 1 clic.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card data-testid="recruit-total-zones"><CardContent className="p-4">
          <p className="text-xs text-gray-500 font-semibold flex items-center gap-1"><Warning size={13} className="text-red-500" /> Zones en tension</p>
          <p className="text-3xl font-extrabold text-gray-800">{totals.hot_zones}</p>
        </CardContent></Card>
        <Card data-testid="recruit-total-candidates"><CardContent className="p-4">
          <p className="text-xs text-gray-500 font-semibold">Candidats (courier/livreur)</p>
          <p className="text-3xl font-extrabold text-[#FF5000]">{totals.candidates}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500 font-semibold flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" /> Actualisation</p>
          <p className="text-sm font-bold text-emerald-600 mt-2">Toutes les 15s</p>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-10"><CircleNotch size={20} className="animate-spin" /> Chargement…</div>
      ) : (data?.hot_zones || []).length === 0 ? (
        <div className="text-center py-16" data-testid="recruit-empty">
          <CheckCircle size={40} weight="duotone" className="text-emerald-500 mx-auto mb-3" />
          <p className="text-gray-500">Aucune zone en tension actuellement. L'offre taxi couvre la demande. 👍</p>
        </div>
      ) : (
        <div className="space-y-5">
          {data.hot_zones.map((z) => (
            <Card key={z.zone} className="border-red-300 shadow-sm" data-testid={`recruit-zone-${z.zone}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
                  <span className="flex items-center gap-2"><MapPin size={18} weight="fill" className="text-[#FF5000]" /> {z.zone}</span>
                  <span className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">{z.pending} en attente</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">{z.online_taxi} taxi en ligne</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white" data-testid={`recruit-deficit-${z.zone}`}>déficit {z.deficit}</span>
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(z.candidates || []).length === 0 && (
                  <p className="text-xs text-gray-400">Aucun chauffeur livraison/coursier localisé dans cette zone.</p>
                )}
                {(z.candidates || []).map((c) => (
                  <div key={c.driver_id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-xl p-3 bg-gray-50/60" data-testid={`recruit-candidate-${c.driver_id}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{c.name}</p>
                      <p className="text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                        <span className={`w-1.5 h-1.5 rounded-full ${c.is_online ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        {c.is_online ? 'En ligne' : 'Hors-ligne'} · {c.vehicle_type || 'véhicule ?'}
                        {c.vtc_eligible
                          ? <span className="inline-flex items-center gap-0.5 text-emerald-600"><ShieldCheck size={12} weight="fill" /> VTC OK</span>
                          : <span className="inline-flex items-center gap-0.5 text-amber-600"><ShieldSlash size={12} /> sans Carte VTC</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" onClick={() => activate(c, z.zone)} disabled={!!busy[c.driver_id]}
                        className="bg-[#FF5000] hover:bg-[#e64900] text-white" data-testid={`recruit-activate-${c.driver_id}`}>
                        {busy[c.driver_id] === 'activate' ? <CircleNotch size={14} className="animate-spin" /> : <><Lightning size={14} weight="fill" className="mr-1" /> Activer</>}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => invite(c, z.zone)} disabled={!!busy[c.driver_id]}
                        data-testid={`recruit-invite-${c.driver_id}`}>
                        {busy[c.driver_id] === 'invite' ? <CircleNotch size={14} className="animate-spin" /> : <><PaperPlaneTilt size={14} className="mr-1" /> Inviter</>}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminTaxiRecruitment;
