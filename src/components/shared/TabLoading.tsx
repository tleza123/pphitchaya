'use client';

export function TabLoading() {
  return (
    <div aria-busy="true" aria-label="กำลังโหลดข้อมูล" className="tabLoading">
      {[0, 1, 2].map(index => (
        <div className="loadingCard" key={index}>
          <span className="loadingLine" />
          <span className="loadingLine" />
        </div>
      ))}
    </div>
  );
}
