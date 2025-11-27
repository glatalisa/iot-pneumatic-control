const prevButton = document.getElementById('up')
const nextButton = document.getElementById('down')
const slides = document.querySelectorAll('.text-slide')

let active = 0;
const total = slides.length;
let isAnimating = false;
const transitionDuration = 500;

function update(direction) {
    if (isAnimating) return;
    isAnimating = true;

    const currentSlide = slides[active];
    let newActiveIndex;

    if (direction > 0) {
        newActiveIndex = (active + 1) % total;
    } else {
        newActiveIndex = (active - 1 + total) % total;
    }

    const newSlide = slides[newActiveIndex];

    currentSlide.classList.remove('active');

    if (direction > 0) {
        
        currentSlide.classList.add('exit-up');
        newSlide.classList.add('active');
        
    } else {
        currentSlide.classList.add('exit-down');
        newSlide.classList.add('enter-from-top');
        void newSlide.offsetWidth; 
        newSlide.classList.add('active');
    }
    active = newActiveIndex;

    setTimeout(() => {
        currentSlide.classList.remove('exit-up', 'exit-down');
        newSlide.classList.remove('enter-from-top'); 
        
        isAnimating = false;
    }, transitionDuration);
}

prevButton.addEventListener('click', () => {
    update(-1)
})

nextButton.addEventListener('click', () => {
    update(1)
})