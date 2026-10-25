import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mountIsland } from './island.js';
import { createIslandHost } from './islandHost.js';
import './island.css';

/**
 * 首頁的島嶼卡片（取代原本的 home-garden-entry）。
 * 建議用 React.lazy 載入，three.js 就不會拖慢首頁首屏：
 *   const IslandCard = lazy(() => import('../island/IslandCard.jsx'));
 */
export default function IslandCard({ onFullscreenChange }) {
  const slotRef = useRef(null);
  const [failed, setFailed] = useState('');

  useEffect(() => {
    const handle = mountIsland(slotRef.current, {
      THREE,
      OrbitControls,
      host: createIslandHost(),
      onFail: setFailed,
      onFullscreenChange
    });
    return () => handle.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div ref={slotRef} />
      {failed && <p className="v2-muted v2-small">{failed}</p>}
    </>
  );
}
