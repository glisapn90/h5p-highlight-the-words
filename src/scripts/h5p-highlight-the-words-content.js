import HighlightTheWordsMenu from './h5p-highlight-the-words-menu';
import HighlightTheWordsTitlebar from './h5p-highlight-the-words-titlebar';
import TextProcessing from './h5p-highlight-the-words-text-processing';
import Util from './h5p-highlight-the-words-util';

/** Class representing the content */
export default class HighlightTheWordsContent {
  /**
   * @constructor
   */
  constructor(params = {}, callbacks = {}) {
    // Sanitize
    this.callbacks = callbacks;
    this.callbacks.handleButtonFullscreen = callbacks.handleButtonFullscreen || (() => {});

    // Selections to be dealt with
    this.pendingSelection = null;

    // Active selections
    this.selections = [];

    this.currentSelectColor = 'rgb(252, 233, 0)';

    params.text = params.text.replace(/(\r\n|\n|\r)/gm, '');
    this.maskHTML = TextProcessing.createHTMLMask(params.text);

    // TODO: Get rid of these two functions
    this.structureEncoded = TextProcessing.buildTextStructure(params.text);
    this.structureDecoded = TextProcessing.recodeTextStructure(this.structureEncoded, 'decode');

    this.originalTextDecoded = this.structureDecoded.text;
    this.maskHTMLDecoded = this.structureDecoded.mask;

    this.content = document.createElement('div');
    this.content.classList.add('h5p-highlight-the-words-content');

    // Titlebar
    this.titlebar = new HighlightTheWordsTitlebar(
      {
        a11y: {
          buttonMenuOpen: params.a11y.buttonMenuOpen,
          buttonMenuClose: params.a11y.buttonMenuClose,
          buttonFullscreenEnter: params.a11y.buttonFullscreenEnter,
          buttonFullscreenExit: params.a11y.buttonFullscreenExit
        }
      },
      {
        onColorChanged: (color) => {
          this.handleColorChanged(color);
        },
        onButtonMenuClicked: () => {
          this.handleMenuButtonClicked();
        },
        onButtonFullscreenClicked: this.callbacks.onButtonFullscreenClicked
      }
    );
    this.content.appendChild(this.titlebar.getDOM());

    // Page
    this.page = document.createElement('div');
    this.page.classList.add('h5p-highlight-the-words-page');
    this.content.appendChild(this.page);

    this.menu = new HighlightTheWordsMenu();
    this.page.appendChild(this.menu.getDOM());

    // Excercise
    this.exercise = document.createElement('div');
    this.exercise.classList.add('h5p-highlight-the-words-exercise');

    // Task description
    if (params.taskDescription) {
      this.exercise.appendChild(this.buildTaskDescription(params.taskDescription));

      const ruler = document.createElement('div');
      ruler.classList.add('h5p-highlight-the-words-ruler');
      this.exercise.appendChild(ruler);
    }

    // Text container
    this.originalText = params.text;

    const textContainer = this.buildTextContainer(this.originalText);
    this.exercise.appendChild(textContainer);

    const ruler = document.createElement('div');
    ruler.classList.add('h5p-highlight-the-words-ruler');
    this.exercise.appendChild(ruler);

    this.page.appendChild(this.exercise);

    this.addSelectEventHandler();
  }

  /**
   * Return the DOM for this class.
   * @return {HTMLElement} DOM for this class.
   */
  getDOM() {
    return this.content;
  }

  /**
   * Return DOM for exercise element.
   * @return {HTMLElement} DOM for exercise element.
   */
  getExerciseDOM() {
    return this.exercise;
  }

  /**
   * Build task description.
   * @param {string} text Text.
   * @return {HTMLElement} Task description element.
   */
  buildTaskDescription(text) {
    const taskDescription = document.createElement('div');
    taskDescription.classList.add('h5p-highlight-the-words-task-description');
    taskDescription.innerHTML = text;

    return taskDescription;
  }

  /**
   * Build text container.
   * @param {string} text Text.
   * @return {HTMLElement} Text container element.
   */
  buildTextContainer(text) {
    const textContainer = document.createElement('div');
    textContainer.classList.add('h5p-highlight-the-words-text-container');

    // TODO: Don't define textArea here but outside of function
    this.textArea = document.createElement('div');
    this.textArea.classList.add('h5p-highlight-the-words-text');

    this.textArea.innerHTML = text;
    textContainer.appendChild(this.textArea);

    return textContainer;
  }

  /**
   * Add handler for selecting text.
   */
  addSelectEventHandler() {
    document.addEventListener('mouseup', this.handleSelectionEnd.bind(this));
    document.addEventListener('touchend', this.handleSelectionEnd.bind(this));

    this.selectionChangedListener = this.handleSelectionChange.bind(this);
    this.textArea.addEventListener('selectstart', (event) => {
      // Prevent accidentally selecting with multiple clicks, // TODO: Remove?
      if (this.lastSelectStart && event.timeStamp - this.lastSelectStart < 1000) {
        return;
      }
      this.lastSelectStart = event.timeStamp;

      document.addEventListener('selectionchange', this.selectionChangedListener);
    });
  }

  /**
   * Handle selection change event.
   */
  handleSelectionChange() {
    // Will always be from textContainer
    this.pendingSelection = document.getSelection();
  }

  /**
   * Handle selection end event.
   */
  handleSelectionEnd() {
    document.removeEventListener('selectionchange', this.selectionChangedListener);

    if (
      !this.pendingSelection || // Just to be safe
      this.pendingSelection.isCollapsed || // Nothing selected
      !Util.isChild(this.pendingSelection.anchorNode, this.textArea) ||
      !Util.isChild(this.pendingSelection.focusNode, this.textArea)
    ) {
      this.pendingSelection = null;
      return; // Part of selection outside of text container
    }

    let start = this.pendingSelection.anchorOffset;
    start += this.computeSelectionOffset(this.pendingSelection.anchorNode);
    start = Util.nthIndexOf(this.maskHTML, '1', start + 1);

    let end = this.pendingSelection.focusOffset;
    end += this.computeSelectionOffset(this.pendingSelection.focusNode);
    end = Util.nthIndexOf(this.maskHTML, '1', end) + 1;

    // New selection
    this.addSelection({
      text: this.pendingSelection.toString(),
      start: (start < end) ? start : end,
      end: (end > start) ? end : start,
      color: this.currentSelectColor
    });

    this.updateTextContainer();

    this.pendingSelection = null;
  }

  /**
   * Find selection.
   * @param {number} position Position in text.
   * @return {object} Selection. Can only be one since no overlaps are allowed.
   */
  findSelection(position) {
    return this.selections
      .filter(selection => selection.start <= position && selection.end > position)
      .shift();
  }

  computeLocalOffset(node) {
    const siblings = [...node.parentElement.childNodes];
    return siblings
      .slice(0, siblings.indexOf(node)) // left siblings
      .reduce((length, sibling) => {
        return length + sibling.textContent.length;
      }, 0); // summed length of left siblings
  }

  /**
   * Compute offset of selection in node.
   * @param {Node} node Node that contains selection text.
   * @return {number} Number of characters in nodes in front of node.
   */
  computeSelectionOffset(node) {
    let offset = 0;
    while (node !== this.textArea) {
      const add = this.computeLocalOffset(node);

      offset += add;

      node = node.parentElement;
    }

    return offset;
  }

  /**
   * Add selection.
   * @param {object} params Parameters.
   * @param {number} params.start Start position.
   * @param {number} params.end End position.
   * @param {string} params.text Selected text.
   * @param {string} params.color Selected color.
   */
  addSelection(params) {
    if (
      typeof params.start !== 'number' || params.start < 0 ||
      typeof params.end !== 'number' || params.end < params.start ||
      typeof params.text !== 'string' || //params.text.length !== params.end - params.start ||
      typeof params.color !== 'string'
    ) {
      return; // Invalid input
    }

    this.selections = this.selections
      .filter(selection => selection.start < params.start || selection.end > params.end) // remove consumed selections
      .map(selection => {
        // Shrink existing selction if overlapping with new selection
        if (selection.start >= params.start && selection.start < params.end && selection.end >= params.end) {
          selection.text = TextProcessing.getMaskedText(this.originalTextDecoded, this.maskHTMLDecoded, params.end, selection.end);
          selection.start = params.end;
        }
        if (selection.end > params.start && selection.end <= params.end) {
          selection.text = TextProcessing.getMaskedText(this.originalTextDecoded, this.maskHTMLDecoded, selection.start, params.start);
          selection.end = params.start;
        }

        return selection;
      });

    // Split existing selection if new selection wants in between
    for (let i = this.selections.length - 1; i >= 0; i--) {
      if (this.selections[i].start < params.start && this.selections[i].end > params.end) {
        const selectionClone = {...this.selections[i]};

        this.selections[i].text = TextProcessing.getMaskedText(this.originalTextDecoded, this.maskHTMLDecoded, this.selections[i].start, params.start);
        this.selections[i].end = params.start;

        selectionClone.text = TextProcessing.getMaskedText(this.originalTextDecoded, this.maskHTMLDecoded, params.end);
        selectionClone.start = params.end;

        this.selections.push(selectionClone);
      }
    }

    this.selections.push(params);

    this.selections = this.selections
      .filter(selection => {
        return selection.color !== ''; // Remove deleted selections
      })
      .sort((a, b) => a.start - b.start);
  }

  /**
   * Remove selection.
   * @param {number} position Position that is in selection.
   */
  removeSelection(position) {
    this.selections = this.selections.filter(selection => selection.start > position && selection.end <= position);
  }

  /**
   * Get ouptut text and mask for a selection.
   * @param {object[]} selection Selections by user.
   */
  getSelectionOutput(selection) {
    if (!selection.color) {
      return { // Not selected, use original text
        text: this.originalTextDecoded.substring(selection.start, selection.end),
        mask: this.maskHTMLDecoded.substring(selection.start, selection.end)
      };
    }

    const spanPre = `<span style="background-color: ${selection.color};">`;
    const spanPost = '</span>';

    let text = this.originalTextDecoded.substring(selection.start, selection.end);
    let mask = this.maskHTMLDecoded.substring(selection.start, selection.end);


    // TODO: Clean up. Adding divs necessary when selecting text over paragraphs
    // while keeping mask in sync
    const regexp = new RegExp('</div><div>', 'gm');
    let indices = [];
    let array;

    while ((array = regexp.exec(text)) !== null) {
      indices.push(array.index);
    }

    const textArray = [];
    const maskArray = [];

    let position = 0;
    indices.forEach(index => {
      textArray.push(text.substring(position, index));
      maskArray.push(mask.substring(position, index));
      position = index + '</div><div>'.length;
    });
    textArray.push(text.substring(position));
    maskArray.push(mask.substring(position));

    text = textArray.join(`${spanPost}</div><div>${spanPre}`);

    let htmlPlaceholder = Array(`${spanPost}</div><div>${spanPre}`.length + 1).join('0');
    mask = maskArray.join(htmlPlaceholder);

    text = `${spanPre}${text}${spanPost}`;
    htmlPlaceholder = Array(spanPre.length + 1).join('0');
    mask = `${htmlPlaceholder}${mask}`;
    htmlPlaceholder = Array(spanPost.length + 1).join('0');
    mask = `${mask}${htmlPlaceholder}`;

    return {
      text: text,
      mask: mask
    };
  }

  /**
   * Update text container.
   * Rebuilds the innerHTML from the original text, because modifying the
   * HTML strings would be hell
   */
  updateTextContainer() {
    // Break up selections, assuming no overlaps and sorted
    let selectionSplits = [];
    let donePosition = 0;

    this.selections.forEach(selection => {
      if (selection.start > donePosition) {
        selectionSplits.push({
          start: donePosition,
          end: selection.start
        });
      }
      selectionSplits.push(selection);
      donePosition = selection.end;
    });
    if (donePosition < this.originalTextDecoded.length) {
      selectionSplits.push({
        start: donePosition,
        end: this.originalTextDecoded.length
      });
    }

    const results = selectionSplits.map(selection => {
      return this.getSelectionOutput(selection);
    });

    const newText = results.reduce((text, segment) => `${text}${segment.text}`, '');
    const newMask = results.reduce((mask, segment) => `${mask}${segment.mask}`, '');

    this.textArea.innerHTML = TextProcessing.htmlEncodeMasked(newText, newMask);
  }

  /**
   * Enable fullscreen button in titlebar.
   */
  enableFullscreenButton() {
    this.titlebar.enableFullscreenButton();
  }

  /**
   * Set dimensions to fullscreen.
   * @param {boolean} enterFullScreen If true, enter fullscreen, else exit.
   */
  toggleFullscreen(enterFullScreen = false) {
    this.titlebar.toggleFullscreenButton(enterFullScreen);
  }

  /**
   * Handle color changed.
   * @param {string} color Color to be used.
   */
  handleColorChanged(color) {
    this.currentSelectColor = color;
  }

  /**
   * Handle menu button clicked.
   */
  handleMenuButtonClicked() {
    if (this.menu.isOpen()) {
      this.closeMenu();
    }
    else {
      this.openMenu();
    }
  }

  /**
   * Open menu.
   */
  openMenu() {
    this.page.classList.add('h5p-highlight-the-words-menu-open');
    this.menu.open();
  }

  /**
   * Close menu.
   */
  closeMenu() {
    this.page.classList.remove('h5p-highlight-the-words-menu-open');
    this.menu.close();
  }
}