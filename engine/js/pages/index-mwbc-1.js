// Page controller for index-mwbc.html.

		const eaModal = document.getElementById('ea-note-modal');
		const eaTrigger = document.querySelector('.ea-note-trigger');
		const eaClose = document.querySelector('.ea-modal-close');
		const eaBackdrop = document.querySelector('.ea-modal-backdrop');

		function openEaNote() {
			eaModal.hidden = false;
			document.body.style.overflow = 'hidden';
			eaClose.focus();
		}

		function closeEaNote() {
			eaModal.hidden = true;
			document.body.style.overflow = '';
			eaTrigger.focus();
		}

		eaTrigger.addEventListener('click', openEaNote);
		eaClose.addEventListener('click', closeEaNote);
		eaBackdrop.addEventListener('click', closeEaNote);

		document.addEventListener('keydown', (event) => {
			if (event.key === 'Escape' && !eaModal.hidden) {
				closeEaNote();
			}
		});
		