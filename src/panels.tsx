/**
 * Panels
 *
 * Main view - sets up the frame, and the generic panels.
 *
 * Also sets up global event listeners.
 *
 * @author Guangcong Luo <guangcongluo@gmail.com>
 * @license AGPLv3
 */

class PSRouter {
	roomid = '' as RoomID;
	panelState = '';
	constructor() {
		const currentRoomid = location.pathname.slice(1);
		if (/^[a-z0-9-]+$/.test(currentRoomid)) {
			this.subscribeHistory();
		} else if (location.pathname.endsWith('.html')) {
			this.subscribeHash();
		}
	}
	subscribeHash() {
		if (location.hash) {
			const currentRoomid = location.hash.slice(1);
			if (/^[a-z0-9-]+$/.test(currentRoomid)) {
				PS.join(currentRoomid as RoomID);
			} else {
				return;
			}
		}
		PS.subscribeAndRun(() => {
			const roomid = PS.room.id;
			location.hash = roomid ? '#' + roomid : '';
		});
		window.addEventListener('hashchange', e => {
			const possibleRoomid = location.hash.slice(1);
			let currentRoomid: RoomID | null = null;
			if (/^[a-z0-9-]*$/.test(possibleRoomid)) {
				currentRoomid = possibleRoomid as RoomID;
			}
			if (currentRoomid !== null) {
				PS.join(currentRoomid);
			}
		});
	}
	subscribeHistory() {
		const currentRoomid = location.pathname.slice(1);
		if (/^[a-z0-9-]+$/.test(currentRoomid)) {
			PS.join(currentRoomid as RoomID);
		} else {
			return;
		}
		if (!window.history) return;
		PS.subscribeAndRun(() => {
			const room = PS.room;
			const roomid = room.id;
			const panelState = (PS.leftRoomWidth ?
				PS.leftRoom.id + '..' + PS.rightRoom!.id :
				roomid);
			if (roomid === this.roomid && panelState === this.panelState) {
				return;
			}
			if (panelState === this.panelState) {
				history.pushState(panelState, room.title, '/' + roomid);
			} else {
				history.replaceState(panelState, room.title, '/' + roomid);
			}
			this.roomid = roomid;
			this.panelState = panelState;
		});
		window.addEventListener('popstate', e => {
			const possibleRoomid = location.pathname.slice(1);
			let roomid: RoomID | null = null;
			if (/^[a-z0-9-]*$/.test(possibleRoomid)) {
				roomid = possibleRoomid as RoomID;
			}
			if (typeof e.state === 'string') {
				const [leftRoomid, rightRoomid] = e.state.split('..') as RoomID[];
				PS.join(leftRoomid, 'left');
				if (rightRoomid) {
					PS.join(rightRoomid, 'right');
				}
			}
			if (roomid !== null) {
				PS.join(roomid);
			}
		});
	}
}
PS.router = new PSRouter();

class PSRoomPanel<T extends PSRoom = PSRoom> extends preact.Component<{room: T}> {
	subscriptions: PSSubscription[] = [];
	componentDidMount() {
		if (PS.room === this.props.room) this.focus();
		this.props.room.onParentEvent = (id: string, e?: Event) => {
			if (id === 'focus') this.focus();
		};
		this.subscriptions.push(this.props.room.subscribe(args => {
			if (!args) this.forceUpdate();
			else this.receiveLine(args);
		}));
		if (this.base) {
			this.props.room.setDimensions(this.base.offsetWidth, this.base.offsetHeight);
		}
	}
	componentDidUpdate() {
		if (this.base && ['popup', 'semimodal-popup'].includes(this.props.room.location)) {
			this.props.room.setDimensions(this.base.offsetWidth, this.base.offsetHeight);
		}
	}
	componentWillUnmount() {
		this.props.room.onParentEvent = null;
		for (const subscription of this.subscriptions) {
			subscription.unsubscribe();
		}
		this.subscriptions = [];
	}
	receiveLine(args: Args) {}
	/**
	 * PS has "fake select menus", buttons that act like <select> dropdowns.
	 * This function is used by the popups they open to change the button
	 * values.
	 */
	chooseParentValue(value: string) {
		const dropdownButton = this.props.room.parentElem as HTMLButtonElement;
		dropdownButton.value = value;
		const changeEvent = new Event('change');
		dropdownButton.dispatchEvent(changeEvent);
		PS.closePopup();
	}
	focus() {}
	render() {
		return <PSPanelWrapper room={this.props.room}>
			<div class="mainmessage"><p>Loading...</p></div>
		</PSPanelWrapper>;
	}
}

function PSPanelWrapper(props: {
	room: PSRoom, children: preact.ComponentChildren, scrollable?: boolean, width?: number,
}) {
	const room = props.room;
	if (room.location === 'mini-window') {
		if (room.id === 'news') {
			return <div>{props.children}</div>;
		}
		return <div id={`room-${room.id}`} class="mini-window-contents ps-room-light">{props.children}</div>;
	}
	if (room.location !== 'left' && room.location !== 'right') {
		const style = PSMain.getPopupStyle(room, props.width);
		return <div class="ps-popup" id={`room-${room.id}`} style={style}>
			{props.children}
		</div>;
	}
	const style = PSMain.posStyle(room);
	return <div
		class={'ps-room' + (room.id === '' ? '' : ' ps-room-light') + (props.scrollable ? ' scrollable' : '')}
		id={`room-${room.id}`}
		style={style}
	>
		{props.children}
	</div>;
}

class PSMain extends preact.Component {
	constructor() {
		super();
		PS.subscribe(() => this.forceUpdate());

		window.addEventListener('click', e => {
			let elem = e.target as HTMLElement | null;
			if (elem?.className === 'ps-overlay') {
				PS.closePopup();
				e.preventDefault();
				e.stopImmediatePropagation();
				return;
			}
			let clickedRoom = null;
			while (elem) {
				if (` ${elem.className} `.includes(' username ')) {
					const name = elem.getAttribute('data-name');
					const userid = toID(name);
					const roomid = `user-${userid}` as RoomID;
					PS.addRoom({
						id: roomid,
						parentElem: elem,
						parentRoomid: PSMain.containingRoomid(elem),
						rightPopup: elem.className === 'userbutton username',
						username: name,
					});
					PS.update();
					e.preventDefault();
					e.stopImmediatePropagation();
					return;
				}
				if (elem.tagName === 'A' || elem.getAttribute('data-href')) {
					const roomid = this.roomidFromLink(elem as HTMLAnchorElement);
					if (roomid !== null) {
						PS.addRoom({
							id: roomid,
							parentElem: elem,
						});
						PS.update();
						e.preventDefault();
						e.stopImmediatePropagation();
					}
					return;
				}
				if (elem.tagName === 'BUTTON') {
					if (this.handleButtonClick(elem as HTMLButtonElement)) {
						e.preventDefault();
						e.stopImmediatePropagation();
					}
					return;
				}
				if (elem.id.startsWith('room-')) {
					clickedRoom = PS.rooms[elem.id.slice(5)];
					break;
				}
				elem = elem.parentElement;
			}
			if (PS.room !== clickedRoom) {
				if (clickedRoom) PS.room = clickedRoom;
				while (PS.popups.length && (!clickedRoom || clickedRoom.id !== PS.popups[PS.popups.length - 1])) {
					PS.closePopup();
				}
				PS.update();
			}
		});

		window.addEventListener('keydown', e => {
			let elem = e.target as HTMLInputElement | null;
			if (elem) {
				let isTextInput = (elem.tagName === 'INPUT' || elem.tagName === 'TEXTAREA');
				if (isTextInput && ['button', 'radio', 'checkbox', 'file'].includes(elem.type)) {
					isTextInput = false;
				}
				if (isTextInput && elem.value) {
					return;
				}
			}
			if (PS.room.onParentEvent) {
				if (PS.room.onParentEvent('keydown', e) === false) {
					e.stopImmediatePropagation();
					e.preventDefault();
					return;
				}
			}
			let modifierKey = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
			if (modifierKey) return;
			if (e.keyCode === 37) { // left
				PS.arrowKeysUsed = true;
				PS.focusLeftRoom();
			} else if (e.keyCode === 39) { // right
				PS.arrowKeysUsed = true;
				PS.focusRightRoom();
			}
		});

		PS.prefs.subscribeAndRun(key => {
			if (!key || key === 'dark') {
				document.body.className = PS.prefs.dark ? 'dark' : '';
			}
		});
	}
	getRoom(elem: HTMLElement) {
		let curElem: HTMLElement | null = elem;
		while (curElem) {
			if (curElem.id.startsWith('room-')) {
				return PS.rooms[curElem.id.slice(5)];
			}
			curElem = curElem.parentElement;
		}
	}
	handleButtonClick(elem: HTMLButtonElement) {
		switch (elem.name) {
		case 'closeRoom':
			PS.leave(elem.value as RoomID);
			return true;
		case 'joinRoom':
			PS.addRoom({
				id: elem.value as RoomID,
				parentElem: elem,
			});
			PS.update();
			return true;
		case 'send':
		case 'cmd':
			const room = this.getRoom(elem) || PS.mainmenu;
			room.send(elem.value, elem.name === 'send');
			return true;
		}
		return false;
	}
	roomidFromLink(elem: HTMLAnchorElement) {
		let href = elem.getAttribute('data-href');
		if (href) {
			// yes that's what we needed
		} else if (PS.server.id === 'showdown') {
			if (elem.host && elem.host !== 'play.pokemonshowdown.com' && elem.host !== 'psim.us') {
				return null;
			}
			href = elem.pathname;
		} else {
			if (elem.host !== location.host) {
				return null;
			}
			href = elem.pathname;
		}
		const roomid = href.slice(1);
		if (!/^[a-z0-9-]*$/.test(roomid)) {
			return null; // not a roomid
		}
		const redirects = /^(appeals?|rooms?suggestions?|suggestions?|adminrequests?|bugs?|bugreports?|rules?|faq|credits?|news|privacy|contact|dex|insecure)$/;
		if (redirects.test(roomid)) return null;
		return roomid as RoomID;
	}
	static containingRoomid(elem: HTMLElement) {
		let curElem: HTMLElement | null = elem;
		while (curElem) {
			if (curElem.id.startsWith('room-')) {
				return curElem.id.slice(5) as RoomID;
			}
			curElem = curElem.parentElement;
		}
		return null;
	}
	static isEmptyClick(e: MouseEvent) {
		try {
			const selection = window.getSelection()!;
			if (selection.type === 'Range') return false;
		} catch (err) {}
		BattleTooltips.hideTooltip();
	}
	static posStyle(room: PSRoom) {
		let pos: PanelPosition | null = null;
		if (PS.leftRoomWidth === 0) {
			// one panel visible
			if (room === PS.activePanel) pos = {top: 56};
		} else {
			// both panels visible
			if (room === PS.leftRoom) pos = {top: 56, right: PS.leftRoomWidth};
			if (room === PS.rightRoom) pos = {top: 56, left: PS.leftRoomWidth};
		}

		if (!pos) return {display: 'none'};

		let top: number | null = (pos.top || 0);
		let height: number | null = null;
		let bottom: number | null = (pos.bottom || 0);
		if (bottom > 0 || top < 0) {
			height = bottom - top;
			if (height < 0) throw new RangeError("Invalid pos range");
			if (top < 0) top = null;
			else bottom = null;
		}

		let left: number | null = (pos.left || 0);
		let width: number | null = null;
		let right: number | null = (pos.right || 0);
		if (right > 0 || left < 0) {
			width = right - left - 1;
			if (width < 0) throw new RangeError("Invalid pos range");
			if (left < 0) left = null;
			else right = null;
		}

		return {
			display: 'block',
			top: top === null ? `auto` : `${top}px`,
			height: height === null ? `auto` : `${height}px`,
			bottom: bottom === null ? `auto` : `${-bottom}px`,
			left: left === null ? `auto` : `${left}px`,
			width: width === null ? `auto` : `${width}px`,
			right: right === null ? `auto` : `${-right}px`,
		};
	}
	static getPopupStyle(room: PSRoom, width?: number): any {
		if (room.location === 'modal-popup' || !room.parentElem) {
			return {width: width || 480};
		}
		if (!room.width || !room.height) {
			return {
				position: 'absolute',
				visibility: 'hidden',
				margin: 0,
				top: 0,
				left: 0,
			};
		}
		// nonmodal popup: should be positioned near source element
		let style: any = {
			position: 'absolute',
			margin: 0,
		};
		let offset = room.parentElem.getBoundingClientRect();
		let sourceWidth = offset.width;
		let sourceHeight = offset.height;

		let availableHeight = document.documentElement.clientHeight;
		let height = room.height;
		width = width || room.width;

		if (room.rightPopup) {

			if (availableHeight > offset.top + height + 5 &&
				(offset.top < availableHeight * 2 / 3 || offset.top + 200 < availableHeight)) {
				style.top = offset.top;
			} else if (offset.top + sourceHeight >= height) {
				style.bottom = Math.max(availableHeight - offset.top - sourceHeight, 0);
			} else {
				style.top = Math.max(0, availableHeight - height);
			}
			let offsetLeft = offset.left + sourceWidth;
			if (offsetLeft + width > document.documentElement.clientWidth) {
				style.right = 1;
			} else {
				style.left = offsetLeft;
			}

		} else {

			if (availableHeight > offset.top + sourceHeight + height + 5 &&
				(offset.top + sourceHeight < availableHeight * 2 / 3 || offset.top + sourceHeight + 200 < availableHeight)) {
				style.top = offset.top + sourceHeight;
			} else if (height + 5 <= offset.top) {
				style.bottom = Math.max(availableHeight - offset.top, 0);
			} else if (height + 10 < availableHeight) {
				style.bottom = 5;
			} else {
				style.top = 0;
			}

			let availableWidth = document.documentElement.clientWidth - offset.left;
			if (availableWidth < width + 10) {
				style.right = 10;
			} else {
				style.left = offset.left;
			}

		}

		if (width) style.maxWidth = width;

		return style;
	}
	renderRoom(room: PSRoom) {
		const roomType = PS.roomTypes[room.type];
		const Panel = roomType ? roomType.Component : PSRoomPanel;
		return <Panel key={room.id} room={room} />;
	}
	renderPopup(room: PSRoom) {
		const roomType = PS.roomTypes[room.type];
		const Panel = roomType ? roomType.Component : PSRoomPanel;
		if (room.location === 'popup' && room.parentElem) {
			return <Panel key={room.id} room={room} />;
		}
		return <div key={room.id} class="ps-overlay">
			<Panel room={room} />
		</div>;
	}
	render() {
		let rooms = [] as preact.VNode[];
		for (const roomid in PS.rooms) {
			const room = PS.rooms[roomid]!;
			if (room.location === 'left' || room.location === 'right') {
				rooms.push(this.renderRoom(room));
			}
		}
		return <div class="ps-frame">
			<PSHeader style={{top: 0, left: 0, right: 0, height: '50px'}} />
			{rooms}
			{PS.popups.map(roomid => this.renderPopup(PS.rooms[roomid]!))}
		</div>;
	}
}

type PanelPosition = {top?: number, bottom?: number, left?: number, right?: number} | null;
