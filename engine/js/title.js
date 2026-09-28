        function enterGuide() {
            window.location.href = "./milky-way-bar-crawl/intro.html";
        }
		
		/* Optimization Attempt 1. Ideas courtesy of VentruePL 
		- Rewrote the way the title animation works:
		  Now respects reduced motion (oops)
		  The background now only animates when the mouse moves
		*/
        (function () {
			const bg = document.getElementById('titleBackground');
			const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
			
			const mouseStrength = 12; // Previously 6.6 - Feels a bit smoother now
			const centerOffsetX = -5;
			const centerOffsetY = -5;
			const scale = 1.1;
			
			let mouseTargetX = 0;
			let mouseTargetY = 0;
			let mouseX = 0;
			let mouseY = 0;
			let animationFrame = null;
			
			function onMouseMove(e) {
				if (motionQuery.matches) return;
				
				const nx = (e.clientX / window.innerWidth) - 0.5;
				const ny = (e.clientY / window.innerHeight) - 0.5;
				
				mouseTargetX = nx * mouseStrength;
				mouseTargetY = ny * mouseStrength;
				
				if (animationFrame === null) {
					animationFrame = requestAnimationFrame(update);
				}
			}
			
			function onTouchMove(e) {
				if (!e.touches || e.touches.length === 0) return;
				
				const touch = e.touches[0];
				onMouseMove(touch);
			}
			
			function update() {
				const ease = 0.12;
				
				mouseX += (mouseTargetX - mouseX) * ease;
				mouseY += (mouseTargetY - mouseY) * ease;
				
				const settled =
					Math.abs(mouseTargetX - mouseX) < 0.01 &&
					Math.abs(mouseTargetY - mouseY) < 0.01;
				
				if (settled) {
					mouseX = mouseTargetX;
					mouseY = mouseTargetY;
				}
				
				const totalX = mouseX;
				const totalY = mouseY;
				
				bg.style.transform =
					`translate(${centerOffsetX}%, ${centerOffsetY}%) ` +
					`translate(${totalX}px, ${totalY}px) ` +
					`scale(${scale})`;
					
				if (settled) {
					animationFrame = null;
				} else {
					animationFrame = requestAnimationFrame(update);
				}
			}
			
			window.addEventListener('mousemove', onMouseMove, { passive: true });
			window.addEventListener('touchmove', onTouchMove, { passive: true });
			
			motionQuery.addEventListener('change', () => {
				if (motionQuery.matches) {
					if (animationFrame !== null) {
						cancelAnimationFrame(animationFrame);
						animationFrame = null;
					}
					
					mouseX = 0;
					mouseY = 0;
					
					bg.style.transform =
						`translate(${centerOffsetX}%, ${centerOffsetY}%) scale(${scale})`;
				}
			});
		})();
