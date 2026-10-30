// Adds a button for each level, which calls onSelect with the level's index, and selects the
// initial one. The current level's button shows as pressed; pressing it again restarts the level.
export function createLevelMenu(
    container: HTMLElement,
    names: string[],
    onSelect: (index: number) => void,
    initial = 0,
): void {
    const menu = document.createElement('nav');
    menu.className = 'level-menu';
    menu.setAttribute('aria-label', 'Levels');
    const buttons = names.map((name, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = name;
        button.addEventListener('click', () => select(index));
        return button;
    });
    const select = (index: number) => {
        buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
        onSelect(index);
    };
    menu.append(...buttons);
    container.append(menu);
    select(initial);
}
