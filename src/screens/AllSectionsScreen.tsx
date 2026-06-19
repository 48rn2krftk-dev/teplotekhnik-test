import type { ReactNode } from "react";
import type { ScreenDefinition } from "../navigation";

type AllSectionsScreenProps = {
  screens: ScreenDefinition[];
  onOpenScreen: (screenId: ScreenDefinition["id"]) => void;
  renderIcon: (icon: ScreenDefinition["icon"]) => ReactNode;
};

export function AllSectionsScreen({
  screens,
  onOpenScreen,
  renderIcon,
}: AllSectionsScreenProps) {
  return (
    <section className="screen">
      <div className="card">
        <div className="sectionTitle">
          <h2>Все разделы</h2>
          <p>
            Здесь всегда доступен полный список инструментов, независимо от
            настроек нижней панели.
          </p>
        </div>

        <div className="sectionGrid">
          {screens.map((screen) => (
            <button
              className="sectionLink"
              type="button"
              key={screen.id}
              onClick={() => onOpenScreen(screen.id)}
            >
              <span className="sectionLinkIcon">
                {renderIcon(screen.icon)}
              </span>
              <span>
                <b>{screen.title}</b>
                <small>{screen.description}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
