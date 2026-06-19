type LibraryPlaceholderScreenProps = {
  title: string;
  description: string;
};

export function LibraryPlaceholderScreen({
  title,
  description,
}: LibraryPlaceholderScreenProps) {
  return (
    <section className="screen">
      <div className="card">
        <div className="sectionTitle">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>

        <div className="emptyLibrary">
          <b>Раздел подготовлен</b>
          <p>
            На следующем этапе здесь появятся создание, редактирование, поиск
            и хранение документов без ограничения по количеству.
          </p>
        </div>
      </div>
    </section>
  );
}
