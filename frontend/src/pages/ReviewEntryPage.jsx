export default function ReviewEntryPage() {
  return (
    <div className="review-page">
      <header className="review-page__header">
        <div>
          <h1 className="review-page__title">工时核审</h1>
          <p className="review-page__subtitle">
            请使用管理员通过微信发送的专属链接打开本页，无法自行输入他人姓名查询。
          </p>
        </div>
      </header>
      <section className="review-page__gate review-page__gate--info">
        <p>若尚未收到链接，请联系门店管理员在统计看板中复制您的专属核审链接。</p>
      </section>
    </div>
  )
}
