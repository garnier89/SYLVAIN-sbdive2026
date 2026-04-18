import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { FileText, Database, ArrowsClockwise } from '@phosphor-icons/react';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const AdminDbBackup = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/db-backup`, { credentials: 'include' });
      setData(await res.json());
    } catch (err) { toast.error('Erreur'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleExport = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sb-drive-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast.success('Export telecharge');
  };

  return (
    <div className="p-6" data-testid="admin-db-backup">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Database size={28} className="text-blue-500" weight="fill" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">DB Backup</h1>
            <p className="text-xs text-gray-500">Etat actuel des collections MongoDB</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} data-testid="refresh-btn"><ArrowsClockwise size={16} className="mr-1" />Rafraichir</Button>
          <Button onClick={handleExport} className="bg-[#3b82f6] text-white" data-testid="export-btn"><FileText size={16} className="mr-1" />Exporter JSON</Button>
        </div>
      </div>

      {loading ? <p className="text-gray-500">Chargement...</p> : data && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Collections</p><p className="text-2xl font-bold">{data.total}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Total documents</p><p className="text-2xl font-bold">{(data.collections || []).reduce((sum, c) => sum + c.count, 0)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">Dernier check</p><p className="text-xs font-bold mt-2">{new Date(data.checked_at).toLocaleString('fr-FR')}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm">Collections MongoDB</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1">
                {(data.collections || []).map(c => (
                  <div key={c.collection} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50" data-testid={`col-${c.collection}`}>
                    <span className="text-sm font-mono">{c.collection}</span>
                    <Badge className="bg-blue-100 text-blue-700">{c.count.toLocaleString()} docs</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default AdminDbBackup;
