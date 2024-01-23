// Función de sustitución para simular la llamada al microservicio de cursos
async function getCourseById(courseId: string) {
    return {
        _id: courseId,
        title: 'Mock Course',
        classes: [],
        instructor: 'Mock Instructor',
        price: 0,
        currency: 'USD',
        purchasers: [] as string[],
        // ...
    }
}

export { getCourseById }
