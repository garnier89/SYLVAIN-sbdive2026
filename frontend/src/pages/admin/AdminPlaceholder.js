import React from 'react';
import { useLocation } from 'react-router-dom';
import { Wrench } from '@phosphor-icons/react';

const AdminPlaceholder = () => {
  const location = useLocation();
  const pageName = location.pathname.split('/').pop().replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="p-6" data-testid="admin-placeholder">
      <h1 className="text-3xl font-light text-gray-800 mb-1" style={{ fontFamily: 'Georgia, Times, serif' }}>{pageName}</h1>
      <hr className="border-gray-200 mb-8" />
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <Wrench size={28} className="text-gray-400" />
        </div>
        <p className="text-gray-500 text-lg font-medium">Module en cours de developpement</p>
        <p className="text-gray-400 text-sm mt-1">Cette fonctionnalite sera disponible prochainement</p>
      </div>
    </div>
  );
};

export default AdminPlaceholder;
