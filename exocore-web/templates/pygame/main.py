import pygame
pygame.init()
screen = pygame.display.set_mode((640, 480))
pygame.display.set_caption('Pygame')
running = True
while running:
    for e in pygame.event.get():
        if e.type == pygame.QUIT: running = False
    screen.fill((30, 30, 30))
    pygame.display.flip()
pygame.quit()
